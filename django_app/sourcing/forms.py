from django import forms

from sourcing.models import SourcingRequest


class SourcingRequestForm(forms.ModelForm):
    photo = forms.ImageField(required=False, widget=forms.ClearableFileInput(attrs={"class": "form-control"}))

    class Meta:
        model = SourcingRequest
        fields = ["productName", "brandName", "sisterProfile", "packingListNotes"]
        widgets = {
            "productName": forms.TextInput(attrs={"class": "form-control"}),
            "brandName": forms.TextInput(attrs={"class": "form-control"}),
            "sisterProfile": forms.Select(attrs={"class": "form-select"}),
            "packingListNotes": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
        }


class RejectForm(forms.Form):
    reason = forms.CharField(widget=forms.Textarea(attrs={"class": "form-control", "rows": 2}), required=True)
