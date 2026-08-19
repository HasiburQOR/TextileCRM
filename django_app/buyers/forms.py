from django import forms
from django.contrib.auth.hashers import make_password

from buyers.models import BuyerProfile, SisterProfile


class BuyerProfileForm(forms.ModelForm):
    portalPassword = forms.CharField(
        label="Portal Password", widget=forms.PasswordInput(attrs={"class": "form-control"}), required=True
    )

    class Meta:
        model = BuyerProfile
        fields = ["name", "contactInfo", "branding", "portalUsername"]
        widgets = {
            "name": forms.TextInput(attrs={"class": "form-control"}),
            "contactInfo": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "branding": forms.TextInput(attrs={"class": "form-control"}),
            "portalUsername": forms.TextInput(attrs={"class": "form-control"}),
        }

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.portalPasswordHash = make_password(self.cleaned_data["portalPassword"])
        if commit:
            instance.save()
        return instance


class SisterProfileForm(forms.ModelForm):
    class Meta:
        model = SisterProfile
        fields = ["buyerProfile", "name", "poReference", "agreementType", "negotiatedRate", "terms", "status"]
        widgets = {
            "buyerProfile": forms.Select(attrs={"class": "form-select"}),
            "name": forms.TextInput(attrs={"class": "form-control"}),
            "poReference": forms.TextInput(attrs={"class": "form-control"}),
            "agreementType": forms.Select(attrs={"class": "form-select"}),
            "negotiatedRate": forms.NumberInput(attrs={"class": "form-control", "step": "0.01"}),
            "terms": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "status": forms.Select(attrs={"class": "form-select"}),
        }
