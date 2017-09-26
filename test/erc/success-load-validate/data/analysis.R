# load content of text file
input <- file("data.txt")
data <- readLines(input)

# save content reps-times in new text file, delimted by separator
reps <- 3
seperator <- "\n"

output <- file("result.txt")
writeLines(text = paste0(rep(data, reps), collapse = seperator), con = output)

close(input)
close(output)
# done.
