FROM alpine
MAINTAINER <http://o2r.info>

ENV HOST o2r.info
ENV COUNT 30
ENV SECONDS 60

# ping 30 times, but at most 60 seconds
CMD ping -c $COUNT -w $SECONDS $HOST

# docker build --tag pingtainer_offline .
# docker run -it --rm pingtainer_offline
# docker run -it --rm --network=none pingtainer_offline
#ping: bad address 'o2r.info'