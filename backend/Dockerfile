# =============================================================================
#  comedores-de-fandangos :: backend (JDK 11 + WildFly 26)
#  Multi-stage: o JDK e o Maven ficam no build, a imagem final so tem JRE+WildFly.
# =============================================================================

# ---------------------------------------------------------------- 1) build
FROM maven:3.8.7-openjdk-11-slim AS build
WORKDIR /src

# pom primeiro: enquanto ele nao mudar, o Docker reaproveita a camada de
# dependencias e o build seguinte nao baixa nada.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests=false

# ---------------------------------------------------------------- 2) runtime
FROM quay.io/wildfly/wildfly:26.1.3.Final-jdk11

ARG PG_DRIVER_VERSION=42.7.3
USER root

# driver JDBC do Postgres
RUN mkdir -p /opt/drivers && \
    curl -fsSL -o /opt/drivers/postgresql.jar \
      "https://repo1.maven.org/maven2/org/postgresql/postgresql/${PG_DRIVER_VERSION}/postgresql-${PG_DRIVER_VERSION}.jar" && \
    chown -R jboss:jboss /opt/drivers

USER jboss

# Configuracao aplicada no BUILD (embedded server). O container ja sobe pronto.
COPY --chown=jboss:jboss docker/wildfly-config.cli /tmp/wildfly-config.cli
RUN /opt/jboss/wildfly/bin/jboss-cli.sh --file=/tmp/wildfly-config.cli && \
    rm -rf /opt/jboss/wildfly/standalone/configuration/standalone_xml_history \
           /opt/jboss/wildfly/standalone/log/* \
           /tmp/wildfly-config.cli

COPY --from=build --chown=jboss:jboss /src/target/fandangos.war \
     /opt/jboss/wildfly/standalone/deployments/fandangos.war

# --- JVM -------------------------------------------------------------------
# G1 com pausa alvo de 100ms, heap fixo (evita redimensionamento em runtime),
# String dedup (payload REST e quase tudo String) e entropia nao bloqueante
# (senao o BCrypt/JWT trava esperando /dev/random em container).
ENV JAVA_OPTS="-Xms512m -Xmx1024m \
    -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UseStringDeduplication \
    -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=256m \
    -XX:+UseCompressedOops -XX:+AlwaysPreTouch \
    -Djava.security.egd=file:/dev/urandom \
    -Djava.net.preferIPv4Stack=true \
    -Djboss.as.management.blocking.timeout=600"

ENV DB_URL=jdbc:postgresql://db:5432/fandangos \
    DB_USER=fandangos \
    DB_PASS=fandangos \
    REDIS_HOST=redis \
    REDIS_PORT=6379 \
    JWT_TTL_MIN=120

EXPOSE 8080 9990

HEALTHCHECK --interval=15s --timeout=4s --start-period=90s --retries=5 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1

CMD ["/opt/jboss/wildfly/bin/standalone.sh", "-b", "0.0.0.0", "-bmanagement", "0.0.0.0"]
