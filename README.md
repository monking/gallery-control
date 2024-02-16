# Gallery Control browser extension

View next/previous image in a sequence with tap, click, or keyboard.

## how to use

### commands

- **next** shows the image *after* the current one.  
  (key: `Right Arrow`, pointer: Right)
- **previous** shows the image *before* the current one.  
  (key: `Left Arrow`, pointer: Left)
- **larger** shows the *full size* version of the current image.  
  (key: `Up Arrow`, pointer: Top)
- **smaller** shows the *thumbnail* version of the current image.  
  (key: `Down Arrow`, pointer: Bottom)
- **pause**/**unpause** continues *next*/*previous* at the *same rate*\*.  
  (key: `Space`, pointer: Middle)
- **stop** pauses and resets rate.  
  (key: `Escape`, pointer: N/A)

\*The rate when unpaused is taken from the recent rate of issuing "next"/"previous" commands.
It defaults to 1Hz if the user has not established a rate, or if that rate is slower than the minimum (currently 0.25Hz, or once every 4 seconds).

### pointer regions

Left, Right, Top, Middle, Bottom
```
+-------+
| | T | |
| |---| |
|L| M |R|
| |---| |
| | B | |
+-------+
```
- Left and Right are the outer 25% horizontally.
- Top and Bottom are the outer 25% vertically (excluding after Left and Right)
- Middle is the 50% left over in the middle.


## how to build

Run `npm start` to build the packaged extension, and also prepare an unpacked version with manifest version 3 (for loading into Chrome).

Run `npm run` to list other script commands.
