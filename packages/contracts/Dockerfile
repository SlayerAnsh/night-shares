FROM ghcr.io/foundry-rs/foundry:v1.7.1
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /contracts
COPY script/install-deps.sh script/install-deps.sh
RUN sh script/install-deps.sh
COPY foundry.toml remappings.txt ./
COPY src src
COPY test/mocks test/mocks
COPY script/*.sol script/
RUN forge build --skip test
COPY script/fork-deploy.sh script/fork-deploy.sh
ENTRYPOINT ["/bin/sh", "script/fork-deploy.sh"]
