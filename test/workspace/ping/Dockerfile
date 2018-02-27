FROM alpine
MAINTAINER <http://o2r.info>

ENV HOST 127.0.0.1
ENV SECONDS 3

RUN chmod u+s /bin/ping

WORKDIR /erc/

# creating document is required to fulfill the check
CMD ping -w $SECONDS $HOST ; echo "<html><body>Am I OK?</body></html>" > display.html
