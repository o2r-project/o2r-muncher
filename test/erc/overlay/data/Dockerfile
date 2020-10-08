FROM rocker/r-verse:3.4.2

ENTRYPOINT ["sh", "-c"]
CMD ["R --vanilla -e \"rmarkdown::render(input = '/erc/main.Rmd', output_file = '/erc/view.html', output_format = rmarkdown::html_document())\""]
