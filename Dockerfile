FROM node:26-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace

ENTRYPOINT ["claude"]
