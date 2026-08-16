from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole, IsSupplierStaff
from apps.audit.services import log_action
from apps.buyers.models import BuyerProfile, SisterProfile
from apps.core.tenancy import TenantScopedViewSet
from apps.expenses import exports, services
from apps.expenses.models import Expense, SourceType
from apps.expenses.serializers import ExpenseSelfSerializer, ExpenseSerializer
from apps.sourcing.models import Product

WRITE_ACTIONS = ("update", "partial_update", "destroy")

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ExpenseViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-48 / FR-72-73: read-mostly — almost every row here is written by
    the QC/Warehouse/Sourcing services via `record_expense()`, not by a
    direct POST. A direct POST is still exposed (e.g. a misc cost that
    isn't produced by any other module) but routes through the same
    service, never a raw serializer save, so the "one shared entry point"
    invariant holds everywhere."""

    queryset = Expense.objects.select_related(
        "sisterProfile__buyerProfile", "product", "createdBy"
    )
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP, Roles.EMPLOYEE, Roles.QC, Roles.WAREHOUSE]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return ExpenseSelfSerializer
        return ExpenseSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        if self.action == "export":
            # A buyer's own list is served through ExpenseSelfSerializer,
            # which deliberately withholds the internal columns (who
            # recorded it, product, field name) that every export format
            # carries. Rather than maintain a second, redacted set of
            # renderers, the download stays supplier-side only.
            return [IsSupplierStaff()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Query-param filters, shared by `list` and `export` so a download
        always contains exactly the slice the table on screen was showing."""
        qs = super().get_queryset()
        params = self.request.query_params

        for param, field in (
            ("sisterProfile", "sisterProfile_id"),
            ("buyerProfile", "sisterProfile__buyerProfile_id"),
            ("product", "product_id"),
            ("createdBy", "createdBy_id"),
            ("currency", "currency"),
        ):
            value = params.get(param)
            if value:
                qs = qs.filter(**{field: value})

        # Comma-separated so one download can cover e.g. every QC cost
        # category at once; a single value still works unchanged.
        source_types = [s for s in params.get("sourceType", "").split(",") if s]
        if source_types:
            qs = qs.filter(sourceType__in=source_types)

        # Inclusive whole-day bounds. TIME_ZONE is UTC, so `__date` matches
        # the YYYY-MM-DD the client derives from the ISO `createdAt`.
        for param, lookup in (("dateFrom", "createdAt__date__gte"), ("dateTo", "createdAt__date__lte")):
            value = params.get(param)
            if value:
                qs = qs.filter(**{lookup: value})

        search = params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(remarks__icontains=search)
                | Q(fieldName__icontains=search)
                | Q(product__name__icontains=search)
                | Q(product__styleNumber__icontains=search)
                | Q(sisterProfile__poReference__icontains=search)
            )

        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfile")).first()
        if not sister_profile:
            raise ValidationError({"sisterProfile": "Required."})
        product = Product.objects.filter(pk=data.get("product")).first() if data.get("product") else None
        expense = services.record_expense(
            sister_profile=sister_profile,
            product=product,
            source_type=data.get("sourceType"),
            amount=data.get("amount"),
            currency=data.get("currency", "BDT"),
            remarks=data.get("remarks", ""),
            field_name=data.get("fieldName", ""),
            created_by=request.user,
        )
        if expense is None:
            raise ValidationError({"amount": "Must be a non-zero amount."})
        return Response(self.get_serializer(expense).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def export(self, request):
        """Downloadable copy of the Central Expense Table, filtered by any
        combination of the `list` query params above (buyer, sister
        profile / PO, product, source types, date range, currency, who
        recorded it, free-text search) and optionally grouped with
        subtotals via `?groupBy=`.

        `filetype` — xlsx (default) | csv | pdf. Named `filetype`, not
        `format`: DRF reserves `format` for renderer selection and an
        unrecognized value there breaks routing before this view runs
        (same reasoning as InvoiceViewSet.export).

        Tenant scoping is inherited from get_queryset(), so this can never
        widen past what the caller may already read.
        """
        group_by = request.query_params.get("groupBy", "none")
        if group_by not in exports.GROUP_BY_OPTIONS:
            raise ValidationError({
                "groupBy": f"Must be one of: {', '.join(exports.GROUP_BY_OPTIONS)}."
            })
        filetype = request.query_params.get("filetype", "xlsx")
        if filetype not in ("xlsx", "csv", "pdf"):
            raise ValidationError({"filetype": "Must be one of: xlsx, csv, pdf."})

        queryset = self.get_queryset().order_by("createdAt")
        count = queryset.count()
        if count > exports.MAX_EXPORT_ROWS:
            raise ValidationError({
                "detail": (
                    f"{count:,} rows match — the export limit is "
                    f"{exports.MAX_EXPORT_ROWS:,}. Narrow the date range or "
                    "pick a buyer / sister profile."
                )
            })
        expenses = list(queryset)

        meta, scope = self._export_meta(request)
        filename = exports.expenses_filename(
            filetype,
            scope=scope,
            date_from=request.query_params.get("dateFrom", ""),
            date_to=request.query_params.get("dateTo", ""),
        )

        if filetype == "csv":
            content = exports.render_expenses_csv(expenses, group_by)
            response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        elif filetype == "pdf":
            content = exports.render_expenses_pdf(expenses, meta, group_by)
            response = HttpResponse(content, content_type="application/pdf")
        else:
            content = exports.render_expenses_xlsx(expenses, meta, group_by)
            response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        # FR-82: a bulk download of every cost figure for a buyer is worth
        # the same "who did what" trail as writing one.
        log_action(
            actor=request.user, action="EXPORT_EXPENSES", entity_type="Expense", entity_id="bulk",
            after={
                "filetype": filetype, "groupBy": group_by, "rows": count,
                "filters": {k: v for k, v in request.query_params.items() if k not in ("filetype", "groupBy")},
            },
        )
        return response

    def _export_meta(self, request) -> tuple[list[tuple[str, str]], str]:
        """Human-readable version of the filters that produced this file —
        written into the xlsx/pdf and (as `scope`) into the filename, so a
        saved copy still says what it contains. Ids are resolved to names;
        an unresolvable id is shown raw rather than silently dropped."""
        params = request.query_params
        meta: list[tuple[str, str]] = []
        scope_parts: list[str] = []

        buyer_id = params.get("buyerProfile")
        if buyer_id:
            buyer = BuyerProfile.objects.filter(pk=buyer_id).first()
            name = buyer.name if buyer else buyer_id
            meta.append(("Buyer", name))
            scope_parts.append(name)
        else:
            meta.append(("Buyer", "All buyers"))

        sister_id = params.get("sisterProfile")
        if sister_id:
            sister = SisterProfile.objects.filter(pk=sister_id).first()
            if sister:
                label = f"{sister.poReference or sister.referenceCode} ({sister.get_agreementType_display()})"
                scope_parts.append(sister.poReference or sister.referenceCode)
            else:
                label = sister_id
            meta.append(("Sister Profile / PO", label))
        else:
            meta.append(("Sister Profile / PO", "All sister profiles"))

        product_id = params.get("product")
        if product_id:
            product = Product.objects.filter(pk=product_id).first()
            meta.append(("Product", f"{product.name} ({product.styleNumber})" if product else product_id))

        source_types = [s for s in params.get("sourceType", "").split(",") if s]
        if source_types:
            labels = dict(SourceType.choices)
            meta.append(("Source Types", ", ".join(labels.get(s, s) for s in source_types)))
        else:
            meta.append(("Source Types", "All"))

        date_from, date_to = params.get("dateFrom", ""), params.get("dateTo", "")
        if date_from or date_to:
            meta.append(("Date Range", f"{date_from or 'earliest'} to {date_to or 'today'}"))
        else:
            meta.append(("Date Range", "All time"))

        if params.get("currency"):
            meta.append(("Currency", params["currency"]))
        if params.get("search"):
            meta.append(("Search", params["search"]))

        group_by = params.get("groupBy", "none")
        if group_by != "none":
            meta.append(("Grouped By", exports.GROUP_BY_OPTIONS[group_by][0]))

        meta.append(("Generated", timezone.now().strftime("%Y-%m-%d %H:%M UTC")))
        meta.append(("Generated By", request.user.display_name()))
        return meta, "-".join(p for p in scope_parts if p)
