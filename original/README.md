# The original

| file | what it is |
|---|---|
| `eliza.mad` | ELIZA, written by Joseph Weizenbaum at MIT in MAD-SLIP for the IBM 7094 under CTSS, 1964–66. Transcribed from the printout found among his papers in the MIT archives in 2021. 80 card columns plus the card sequence number. |
| `tape.200` | The DOCTOR script exactly as published in Weizenbaum's paper, Communications of the ACM 9(1), January 1966. This is what the site runs by default (greeting: `HOW DO YOU DO . PLEASE TELL ME YOUR PROBLEM`). |
| `tape.100` | The DOCTOR script found with the 1965 printout. The surviving code supports all of it. |
| `eliza-portrait-source.png` | The portrait the site's ASCII and stipple Elizas are made from. |

All three ELIZA files come from [rupertl/eliza-ctss](https://github.com/rupertl/eliza-ctss) and are CC0 with the permission of Weizenbaum's estate. A few `R CHANGE MADE DEC 2024` remark cards in `eliza.mad` are the reconstruction team's minimal fixes so the code builds on the reconstructed CTSS; everything else is as printed.

See [`../docs/ctss-session.txt`](../docs/ctss-session.txt) for an unedited session with this code running on the emulated 7094.
