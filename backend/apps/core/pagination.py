from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """DRF's stock PageNumberPagination ignores a client-supplied page size
    unless `page_size_query_param` is set — so every `?page_size=200` the
    admin frontend sends was silently served 50 rows, and lists, search and
    dropdowns lost everything past the 50 newest records. Honoured now, and
    capped so a client can't ask for an unbounded page (500 is the largest
    size the frontend requests anywhere)."""

    # Default size still comes from REST_FRAMEWORK["PAGE_SIZE"].
    page_size_query_param = "page_size"
    max_page_size = 500
