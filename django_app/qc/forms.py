from django import forms

from qc.models import TravelMode


class QCReportForm(forms.Form):
    requestId = forms.UUIDField()
    lunchCostFlag = forms.BooleanField(required=False)
    lunchCost = forms.DecimalField(required=False, min_value=0)
    goodsCarryingCost = forms.DecimalField(required=False, min_value=0)
    travelMode = forms.ChoiceField(choices=TravelMode.choices)
    extraCost = forms.DecimalField(required=False, min_value=0)
