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

RUN apk add --no-cache \
    git \
    wget \
    unzip \
    nodejs \
    ca-certificates \
  && pip install --upgrade pip \
  && pip install bagit \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-muncher /muncher \
  && wget -O /sbin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 \
  && chmod +x /sbin/dumb-init

# o2r-meta
RUN apk add --no-cache \
    gcc \
    g++ \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
  && apk add gdal gdal-dev py-gdal --no-cache --repository http://nl.alpinelinux.org/alpine/edge/testing \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-meta.git
WORKDIR /meta
RUN pip install -r requirements.txt
ENV MUNCHER_META_TOOL_EXE="python3 /meta/o2rmeta.py"

RUN apk del \
    git \
    wget \
    ca-certificates \
  && rm -rf /var/cache

WORKDIR /muncher
RUN npm install --production
ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["npm", "start" ]
