FROM alpine
LABEL maintainer="o2r"

WORKDIR /tmp/
RUN echo "echo '<html>dummy</html>' > display.html" > main.sh

WORKDIR /erc/
CMD ["sh", "/tmp/main.sh"]