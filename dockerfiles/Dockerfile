FROM alpine:3.3
MAINTAINER o2r-project, https://o2r.info

RUN apk add --no-cache nodejs tar unzip git python py-pip \
  && pip install --upgrade pip \
  && pip install bagit \
  && git clone https://github.com/o2r-project/o2r-muncher \
  && cd o2r-muncher \
  && npm install
