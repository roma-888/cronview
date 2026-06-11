# Demo recording for the README. Regenerate with:  vhs scripts/demo.tape
# (brew install vhs; run from the repo root — records the working-tree code)
Output assets/demo.gif

Set FontSize 15
Set Width 1100
Set Height 660
Set Padding 12
Set TypingSpeed 55ms

# Record the working-tree code while showing the real command.
Hide
Type "alias cronview='bun src/index.tsx'"
Enter
Type "clear"
Enter
Show

Type "cronview --file examples/demo.crontab --date 2026-06-10"
Sleep 500ms
Enter
Sleep 2.5s

# Move around the month
Right
Sleep 400ms
Right
Sleep 400ms
Down
Sleep 1.2s

# Job view: plain-English schedule, next/recent runs, log target
Type "t"
Sleep 600ms
Type "3"
Sleep 3.5s
Type "q"
Sleep 800ms

# Week view: 7-day x 24-hour grid
Type "w"
Sleep 2.5s
Type "m"
Sleep 1s

# Filter to one job family
Type "/"
Sleep 500ms
Type "backup"
Sleep 500ms
Enter
Sleep 2s
Escape
Sleep 1.2s

# The keymap card
Type "?"
Sleep 2.5s
Type "q"
Sleep 1s

Type "q"
