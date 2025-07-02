ARG GRAFANA_VERSION="11.2.0"

FROM grafana/grafana-oss:${GRAFANA_VERSION}

ARG GF_INSTALL_IMAGE_RENDERER_PLUGIN="false"

ARG GF_GID="0"

ENV GF_PATHS_PLUGINS="/var/lib/grafana-plugins"
ENV GF_PLUGIN_RENDERING_CHROME_BIN="/usr/bin/chrome"


USER root



RUN mkdir -p "$GF_PATHS_PLUGINS" && \
    chown -R grafana:${GF_GID} "$GF_PATHS_PLUGINS" && \
    if [ $GF_INSTALL_IMAGE_RENDERER_PLUGIN = "true" ]; then \
      if grep -i -q alpine /etc/issue; then \
        apk add --no-cache udev ttf-opensans chromium && \
        ln -s /usr/bin/chromium-browser "$GF_PLUGIN_RENDERING_CHROME_BIN"; \
      else \
        cd /tmp && \
        curl -sLO https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
        DEBIAN_FRONTEND=noninteractive && \
        apt-get update -q && \
        apt-get install -q -y ./google-chrome-stable_current_amd64.deb && \
        rm -rf /var/lib/apt/lists/* && \
        rm ./google-chrome-stable_current_amd64.deb && \
        ln -s /usr/bin/google-chrome "$GF_PLUGIN_RENDERING_CHROME_BIN"; \
      fi \
    fi

# Update Title
RUN sed -i 's|<title>\[\[.AppTitle\]\]</title>|<title>Zemfyre</title>|g' /usr/share/grafana/public/views/index.html
RUN sed -i 's|Loading Grafana|Loading Zemfyre Console|g' /usr/share/grafana/public/views/index.html

##################################################################
## VISUAL
## Update Image files
##################################################################

## Replace Favicon and Apple Touch
COPY img/fav32.png /usr/share/grafana/public/img
COPY img/fav32.png /usr/share/grafana/public/img/apple-touch-icon.png


## Replace Logo
COPY img/logo_light.svg /usr/share/grafana/public/img/grafana_icon.svg

## Update Background
COPY img/background.svg /usr/share/grafana/public/img/g8_login_dark.svg
COPY img/background.svg /usr/share/grafana/public/img/g8_login_light.svg

##################################################################
## HANDS-ON
## Update JavaScript files
##################################################################



RUN find /usr/share/grafana/public/build/ -name *.js \
## Update Title
    -exec sed -i 's|AppTitle="Grafana"|AppTitle="Zemfyre Inc"|g' {} \; \
## Update Login Title
    -exec sed -i 's|LoginTitle="Welcome to Grafana"|LoginTitle="Welcome"|g' {} \; \
## Remove Documentation, Support, Community in the Footer
    -exec sed -i 's|\[{target:"_blank",id:"documentation".*grafana_footer"}\]|\[\]|g' {} \; \
## Remove Edition in the Footer
    -exec sed -i 's|({target:"_blank",id:"license",.*licenseUrl})|()|g' {} \; \
## Remove Version in the Footer
    -exec sed -i 's|({target:"_blank",id:"version",.*CHANGELOG.md":void 0})|()|g' {} \; \
## Remove News icon
    -exec sed -i 's|(.,.....)(....,{className:.,onClick:.,iconOnly:!0,icon:"rss","aria-label":"News"})|null|g' {} \; \
## Remove Open Source icon
    -exec sed -i 's|.push({target:"_blank",id:"version",text:`${..edition}${.}`,url:..licenseUrl,icon:"external-link-alt"})||g' {} \;



RUN if [ $GF_INSTALL_IMAGE_RENDERER_PLUGIN = "true" ]; then \
      if grep -i -q alpine /etc/issue; then \
        grafana-cli \
          --pluginsDir "$GF_PATHS_PLUGINS" \
          --pluginUrl https://github.com/grafana/grafana-image-renderer/releases/latest/download/plugin-alpine-x64-no-chromium.zip \
          plugins install grafana-image-renderer; \
      else \
        grafana-cli \
          --pluginsDir "$GF_PATHS_PLUGINS" \
          --pluginUrl https://github.com/grafana/grafana-image-renderer/releases/latest/download/plugin-linux-x64-glibc-no-chromium.zip \
          plugins install grafana-image-renderer; \
      fi \
    fi

ARG GF_INSTALL_PLUGINS=""

RUN if [ ! -z "${GF_INSTALL_PLUGINS}" ]; then \
      OLDIFS=$IFS; \
      IFS=','; \
      set -e ; \
      for plugin in ${GF_INSTALL_PLUGINS}; do \
        IFS=$OLDIFS; \
        if expr match "$plugin" '.*\;.*'; then \
          pluginUrl=$(echo "$plugin" | cut -d';' -f 1); \
          pluginInstallFolder=$(echo "$plugin" | cut -d';' -f 2); \
          grafana-cli --pluginUrl ${pluginUrl} --pluginsDir "${GF_PATHS_PLUGINS}" plugins install "${pluginInstallFolder}"; \
        else \
          grafana-cli --pluginsDir "${GF_PATHS_PLUGINS}" plugins install ${plugin}; \
        fi \
      done \
    fi

# Remove native data sources
# RUN rm -rf \
#     /usr/share/grafana/public/app/plugins/datasource/elasticsearch \
#     /usr/share/grafana/public/build/elasticsearch* \
#     /usr/share/grafana/public/app/plugins/datasource/graphite \
#     /usr/share/grafana/public/build/graphite* \
#     /usr/share/grafana/public/app/plugins/datasource/opentsdb \
#     /usr/share/grafana/public/build/opentsdb* \
#     /usr/share/grafana/public/app/plugins/datasource/mssql \
#     /usr/share/grafana/public/build/mssql* \
#     /usr/share/grafana/public/app/plugins/datasource/mysql \
#     /usr/share/grafana/public/build/mysql* \
#     /usr/share/grafana/public/app/plugins/datasource/tempo \
#     /usr/share/grafana/public/build/tempo* \
#     /usr/share/grafana/public/app/plugins/datasource/jaeger \
#     /usr/share/grafana/public/build/jaeger* \
#     /usr/share/grafana/public/app/plugins/datasource/zipkin \
#     /usr/share/grafana/public/build/zipkin* \
#     /usr/share/grafana/public/app/plugins/datasource/azuremonitor \
#     /usr/share/grafana/public/build/azureMonitor* \
#     /usr/share/grafana/public/app/plugins/datasource/cloudwatch \
#     /usr/share/grafana/public/build/cloudwatch* \
#     /usr/share/grafana/public/app/plugins/datasource/cloud-monitoring \
#     /usr/share/grafana/public/build/cloudMonitoring* \
#     /usr/share/grafana/public/app/plugins/datasource/parca \
#     /usr/share/grafana/public/build/parca* \
#     /usr/share/grafana/public/app/plugins/datasource/phlare \
#     /usr/share/grafana/public/build/phlare* \
#     /usr/share/grafana/public/app/plugins/datasource/grafana-pyroscope-datasource \
#     /usr/share/grafana/public/build/pyroscope*

# Remove native panels
# RUN rm -rf \
#     /usr/share/grafana/public/app/plugins/panel/alertlist \
#     /usr/share/grafana/public/app/plugins/panel/annolist \
#     /usr/share/grafana/public/app/plugins/panel/dashlist \
#     /usr/share/grafana/public/app/plugins/panel/news \
#     /usr/share/grafana/public/app/plugins/panel/geomap \
#     /usr/share/grafana/public/app/plugins/panel/table-old \
#     /usr/share/grafana/public/app/plugins/panel/traces \
#     /usr/share/grafana/public/app/plugins/panel/flamegraph

# USER grafana

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

## Provisioning
# COPY ./grafana/provisioning /etc/grafana/provisioning