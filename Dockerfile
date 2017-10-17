# (C) Copyright 2017 o2r project. https://o2r.info
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
FROM alpine:3.6

# Python, based on frolvlad/alpine-python3
RUN apk add --no-cache \
  python3 \
  && python3 -m ensurepip \
  && rm -r /usr/lib/python*/ensurepip \
  && pip3 install --upgrade pip setuptools \
  && if [ ! -e /usr/bin/pip ]; then ln -s pip3 /usr/bin/pip ; fi \
  && rm -r /root/.cache

# Add Alpine mirrors, replacing default repositories with edge ones, based on https://github.com/jfloff/alpine-python/blob/master/3.4/Dockerfile
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" > /etc/apk/repositories \
  && echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
  && echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories

# App system dependencies
RUN apk add --no-cache \
    unzip \
    nodejs \
    dumb-init \
    nodejs-npm \
  && pip install --upgrade pip \
  && pip install bagit

# o2r-meta dependencies and installation
RUN apk add --no-cache \
    gcc \
    g++ \
    git \
    gdal \
    py-gdal \
    gdal-dev \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-meta.git /meta
WORKDIR /meta
RUN pip install -r requirements.txt
ENV MUNCHER_META_TOOL_EXE="python3 /meta/o2rmeta.py"
ENV MUNCHER_META_EXTRACT_MAPPINGS_DIR="/meta/broker/mappings"
RUN echo $(git rev-parse --short HEAD) >> version

RUN apk del \
  git \
  && rm -rf /var/cache

# App installation
WORKDIR /muncher
COPY config config
COPY controllers controllers
COPY lib lib
COPY index.js index.js
COPY package.json package.json

RUN npm install --production

# Metadata params provided with docker build command
ARG VERSION=dev
ARG VCS_URL
ARG VCS_REF
ARG BUILD_DATE
ARG META_VERSION

# Metadata http://label-schema.org/rc1/
LABEL maintainer="o2r-project <https://o2r.info>" \
  org.label-schema.vendor="o2r project" \
  org.label-schema.url="http://o2r.info" \
  org.label-schema.name="o2r muncher" \
  org.label-schema.description="ERC execution and CRUD" \    
  org.label-schema.version=$VERSION \
  org.label-schema.vcs-url=$VCS_URL \
  org.label-schema.vcs-ref=$VCS_REF \
  org.label-schema.build-date=$BUILD_DATE \
  org.label-schema.docker.schema-version="rc1" \
  info.o2r.meta.version=$META_VERSION

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start" ]