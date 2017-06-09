# (C) Copyright 2016 The o2r project. https://o2r.info
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
FROM frolvlad/alpine-python3
MAINTAINER o2r-project <https://o2r.info>

# Installation time and run-time dependencies
RUN apk add --no-cache \
    git \
    wget \
    unzip \
    nodejs \
    nodejs-npm \
    ca-certificates \
  && pip install --upgrade pip \
  && pip install bagit \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-muncher /muncher \
  && wget -O /sbin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 \
  && chmod +x /sbin/dumb-init

# o2r-meta dependencies and installation
# add mirrors
RUN echo "http://dl-1.alpinelinux.org/alpine/v3.5/main" >> /etc/apk/repositories && \
	echo "http://dl-2.alpinelinux.org/alpine/v3.5/main" >> /etc/apk/repositories && \
	echo "http://dl-3.alpinelinux.org/alpine/v3.5/main" >> /etc/apk/repositories && \
	echo "http://dl-4.alpinelinux.org/alpine/v3.5/main" >> /etc/apk/repositories && \
	echo "http://dl-5.alpinelinux.org/alpine/v3.5/main" >> /etc/apk/repositories && \
	echo "http://dl-1.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories && \
	echo "http://dl-2.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories && \
	echo "http://dl-3.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories && \
	echo "http://dl-4.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

RUN apk add --no-cache \
    gcc \
    g++ \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
  && apk add gdal gdal-dev py-gdal --no-cache --repository http://nl.alpinelinux.org/alpine/edge/testing \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-meta.git /meta
WORKDIR /meta
RUN pip install -r requirements.txt
ENV MUNCHER_META_TOOL_EXE="python3 /meta/o2rmeta.py"
ENV MUNCHER_META_EXTRACT_MAPPINGS_DIR="/meta/broker/mappings"
RUN echo $(git rev-parse --short HEAD) >> version

RUN apk del \
    git \
    wget \
    ca-certificates \
  && rm -rf /var/cache

# App installation
WORKDIR /muncher
RUN npm install --production

# Metadata params provided with docker build command
ARG VERSION=dev
ARG VCS_URL
ARG VCS_REF
ARG BUILD_DATE
ARG META_VERSION

# Metadata http://label-schema.org/rc1/
LABEL org.label-schema.vendor="o2r project" \
      org.label-schema.url="http://o2r.info" \
      org.label-schema.name="o2r muncher" \
      org.label-schema.description="ERC execution and CRUD" \    
      org.label-schema.version=$VERSION \
      org.label-schema.vcs-url=$VCS_URL \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.docker.schema-version="rc1" \
      info.o2r.meta.version=$META_VERSION

ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["npm", "start" ]
