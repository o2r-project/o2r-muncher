FROM alpine:3.4
MAINTAINER o2r-project, https://o2r.info

RUN apk add --no-cache nodejs tar unzip python py-pip git \
  && pip install --upgrade pip \
  && pip install bagit \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-muncher /muncher \
  && apk del py-pip git \
  && rm -rf /var/cache 
RUN cd /muncher && npm install
CMD cd /muncher && npm start
