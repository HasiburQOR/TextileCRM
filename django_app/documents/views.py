from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from buyers.models import SisterProfile
from documents.models import DocumentType, DocumentVault


@login_required
def document_list(request):
    if request.method == "POST":
        file_obj = request.FILES.get("file")
        if file_obj:
            DocumentVault.objects.create(
                sisterProfile_id=request.POST.get("sisterProfileId"),
                documentType=request.POST.get("documentType", DocumentType.OTHER),
                file=file_obj,
                fileName=file_obj.name,
                fileSize=file_obj.size,
                uploadedBy=request.user,
            )
            messages.success(request, "Document uploaded.")
        else:
            messages.error(request, "Please choose a file to upload.")
        return redirect("documents:list")

    documents = DocumentVault.objects.select_related("sisterProfile", "uploadedBy").order_by("-createdAt")
    return render(
        request,
        "documents/document_list.html",
        {"documents": documents, "sister_profiles": SisterProfile.objects.all(), "document_types": DocumentType.choices},
    )
