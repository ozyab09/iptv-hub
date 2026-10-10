## Task: Redesign programme guide grid

### Requirements

1. **Remove separate programme guide button on video** - Show the guide below the video when there's space, instead of a separate button on the video frame.

2. **Remove list/grid tabs** - Keep only the list view for current programme (under the video).

3. **EPG indicator on channels** - Show a small indicator/icon on channels that have EPG loaded:
   - In channel list
   - In recents (недавние)
   - In favorites (избранное)
   - Next to favorite/edit buttons
   - Icon size smaller than favorite/edit buttons

4. **Hourly grid for channels without EPG** - For channels without EPG, show an hourly grid (1-hour slots) below the video, displaying "без названия" in gray instead of programme names.

5. **Clickable programmes and hourly slots** - All programme names and hourly grid slots should be clickable:
   - Click seeks to that time in player (rewind to start of programme)
   - Progress bar should allow moving from start to end of the programme
   - If stream doesn't allow seeking - show error when attempting to seek

### Acceptance Criteria
- [ ] Guide appears below video when space permits
- [ ] No separate guide button on video frame
- [ ] No list/grid tabs
- [ ] EPG indicator visible on channels with EPG in all lists
- [ ] Hourly grid shown for channels without EPG
- [ ] Clicking programme/slot seeks to correct position
- [ ] Progress bar constrained to programme boundaries
- [ ] Error shown when seeking not supported by stream