FROM alpine
MAINTAINER <http://o2r.info>

ENV HOST 127.0.0.1
ENV COUNT 30
ENV SECONDS 60

# ping 30 times, but at most 60 seconds
CMD ping -c $COUNT -w $SECONDS $HOST

# docker build --tag pingtainer .
# docker run -it --rm pingtainer