{{/*
Helpers Helm partagés.
*/}}

{{/*
Nom complet de la release (préfixe pour toutes les ressources).
*/}}
{{- define "intranet.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Nom court (pour container names).
*/}}
{{- define "intranet.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Labels standards (Kubernetes Recommended Labels)
https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
*/}}
{{- define "intranet.labels" -}}
app.kubernetes.io/name: {{ include "intranet.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/part-of: omnitech-intranet
{{- end -}}

{{/*
Selector labels (subset of labels, immutable)
*/}}
{{- define "intranet.selectorLabels" -}}
app.kubernetes.io/name: {{ include "intranet.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Image registry prefix (gère imageRegistry global).
Usage : {{ include "intranet.image" (dict "repo" "omnitech/backend" "tag" "1.0.0" "global" .Values.global) }}
*/}}
{{- define "intranet.image" -}}
{{- $registry := .global.imageRegistry -}}
{{- if $registry -}}
{{ $registry }}/{{ .repo }}:{{ .tag }}
{{- else -}}
{{ .repo }}:{{ .tag }}
{{- end -}}
{{- end -}}

{{/*
Nom du Secret Kubernetes contenant les variables sensibles.
Si Sealed Secrets est activé, on suppose que `omnitech-secrets` est créé
hors-chart par un SealedSecret pré-appliqué.
*/}}
{{- define "intranet.secretName" -}}
{{- printf "omnitech-secrets" -}}
{{- end -}}
