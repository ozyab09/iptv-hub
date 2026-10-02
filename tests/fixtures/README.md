Медиа для регрессионного теста записей: синий кадр 160×90 и тон 440 Гц,
4 секунды, H.264 baseline + AAC. Синтетические файлы, не содержат чужого контента.
TS начинается с ненулевых временных меток, как запись текущего эфира.

Сгенерировано FFmpeg 7.1 (для тестов, не зависимость приложения):

```sh
ffmpeg -f lavfi -i "color=c=blue:s=160x90:r=10:d=4" -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=4" -c:v libx264 -profile:v baseline -pix_fmt yuv420p -preset ultrafast -g 10 -c:a aac -b:a 32k -output_ts_offset 120 -f mpegts recording.mpegts
ffmpeg -i recording.mpegts -c copy -movflags +faststart recording.mp4
ffmpeg -i recording.mp4 -c:v libvpx -b:v 30k -c:a libopus -b:a 32k recording.webm
```

WebM использует VP8 + Opus и содержит длительность в контейнере.
