# sebimoe/christmas-tree-simulator

Supporting library for [sebimoe/christmas-tree-simulator-app](https://github.com/sebimoe/christmas-tree-simulator-app).

See [Matt Parker's video](https://www.youtube.com/watch?v=WuMRJf6B5Q4) for background information. 

## Exports
| Export | Description |
| ------ | ----------- |
| CoordinateDecoders.​LineDelimitedJsonArray​CoordinateDecoder | Decodes coordinate file containing line-delimited 3-element json arrays of X, Y, Z coordinates. |
| CoordinateDecoders.​JsonArray​CoordinateDecoder | Decodes coordinate file containing a JSON string representing an array containing nested 3-element arrays consisting of X, Y, Z coordinates. |
| CoordinateDecoders.​Csv​CoordinateDecoder | Decodes coordinate file containing X, Y, Z coordinates in the first 3 columns (by default). |
| CsvAnimationDecoder | Decodes CSV file containing columns named R_0, G_0, B_0, R_1, G_1, and so on. Names are taken from heading row. Allows for easy mapping of frames into desired format by using custom mapping fuctions (see constructor). |
| CoordinateMapping | Helper class for accessing vertex coordinate mapping. |
| ChristmasTreeSimulator | Main simulator class, acting as a playback controller. |
