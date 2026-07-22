#!/bin/bash

for file in *.mmd; do
  echo "Exporting $file..."
  npx -y @mermaid-js/mermaid-cli -i "$file" -o "${file%.mmd}.svg"
done