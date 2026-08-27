# =============================================================================
#  comedores-de-fandangos :: frontend (AngularJS 1.8 + hooks proprios + axios)
#  Servido por nginx. Sem node, sem webpack, sem node_modules.
# =============================================================================

# ------------------------------------------------------- 1) vendors
# Baixados no BUILD e embutidos na imagem: em producao nao se depende de CDN
# (rede corporativa bloqueia, CDN cai, e cada dominio novo custa DNS + TLS).
FROM alpine:3.19 AS vendors

ARG ANGULAR_VERSION=1.8.3
ARG AXIOS_VERSION=1.6.8

RUN apk add --no-cache curl && mkdir -p /vendor && \
    curl -fsSL -o /vendor/angular.min.js \
      "https://cdnjs.cloudflare.com/ajax/libs/angular.js/${ANGULAR_VERSION}/angular.min.js" && \
    curl -fsSL -o /vendor/axios.min.js \
      "https://cdn.jsdelivr.net/npm/axios@${AXIOS_VERSION}/dist/axios.min.js" && \
    # falha o build se algum download vier vazio/corrompido
    test -s /vendor/angular.min.js && test -s /vendor/axios.min.js && \
    grep -q "angular" /vendor/angular.min.js && \
    grep -q "axios"   /vendor/axios.min.js

# ------------------------------------------------------- 2) runtime
FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=vendors /vendor/ /usr/share/nginx/html/vendor/
COPY index.html /usr/share/nginx/html/
COPY app/ /usr/share/nginx/html/app/

# pre-comprime os estaticos: o nginx serve o .gz pronto em vez de gastar
# CPU comprimindo o mesmo arquivo em todo request
RUN apk add --no-cache gzip && \
    find /usr/share/nginx/html -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \) \
      -exec gzip -9 -k {} \; && \
    apk del gzip

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
