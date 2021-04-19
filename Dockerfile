# (C) Copyright 2021 o2r project. https://o2r.info
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
FROM node:12-slim

# Python, based on frolvlad/alpine-python3
RUN apt-get update && apt-get install -y \
    python \
    python-pip \
    unzip \
    # needed for npm install (gyp, GitHub deps)
    make \
    g++ \
    wget \
    git \
  && wget https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_amd64.deb \
  && dpkg -i dumb-init_*.deb \
  && pip install --upgrade setuptools \
  && pip install bagit

# Install app
WORKDIR /muncher
COPY package.json package.json
RUN npm install --production

# Clean up
RUN apt-get purge -y \
  make \
  g++ \
  wget \
  git \
  && apt-get autoremove -y \
  && rm -rf /var/cache

# Copy files after npm install to utilize build caching
COPY config config
COPY controllers controllers
COPY lib lib
COPY index.js index.js

# Metadata params provided with docker build command
ARG VERSION=dev
ARG VCS_URL
ARG VCS_REF
ARG BUILD_DATE
ARG META_VERSION

# Metadata http://label-schema.org/rc1/
LABEL maintainer="o2r-project <https://o2r.info>" \
  org.label-schema.vendor="o2r project" \
  org.label-schema.url="https://o2r.info" \
  org.label-schema.name="o2r muncher" \
  org.label-schema.description="ERC execution and CRUD" \
  org.label-schema.version=$VERSION \
  org.label-schema.vcs-url=$VCS_URL \
  org.label-schema.vcs-ref=$VCS_REF \
  org.label-schema.build-date=$BUILD_DATE \
  org.label-schema.docker.schema-version="rc1" \
  info.o2r.meta.version=$META_VERSION

# If running in a container the app is root, so the second order containers also must have root access, otherwise permission problems arise
ENV MUNCHER_META_TOOL_CONTAINER_USER=root
ENV MUNCHER_CONTAINERIT_USER=root
ENV MUNCHER_CONTAINER_USER=root

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start" ]
