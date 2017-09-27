COUNTER=1

while [ $COUNTER -le $SHEEP ]; do
  echo $COUNTER sheep
  sleep $(( $COUNTER ))
  COUNTER=$((COUNTER + 1))
done