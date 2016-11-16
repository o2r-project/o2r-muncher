FROM ubuntu:latest
MAINTAINER <http://o2r.info>

RUN apt-get update \
    && apt-get -y install \
      stress \
    && rm -rf /var/lib/apt/lists/*

ENV SQRT_WORKERS 4
ENV TIMEOUT 30
ENV DELAY_MICROSECS 5000000

# stress two cores but at most 20 seconds
CMD stress --verbose --timeout $TIMEOUT --cpu $SQRT_WORKERS --backoff $DELAY_MICROSECS

# docker build --tag stresstainer .
# docker run -it --rm stresstainer
# docker run -it --rm --cpu-shares=256 stresstainer
# docker run -d --cpu-shares=128 -e "DELAY_MICROSECS=0" stresstainer && docker run -it --rm -e "SQRT_WORKERS=2" -e "TIMEOUT=20" stresstainer

# observe with docker stats