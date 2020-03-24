# http://www.budgetshippingcontainers.co.uk/info/how-many-shipping-containers-are-there-in-the-world/
containers <- c(23000000, 14000000, 6000000)
set.seed(42)

png("display.png", width = 1000)
barplot(containers, names.arg = c("in service", "ex-service", "new"),
    col = sample(colors(), 3),
    xlab = "status", ylab = "count", las = 1,
    main = paste0(format(sum(containers), scientific = FALSE),
        " containers in the world"))
dev.off()
