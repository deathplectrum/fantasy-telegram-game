# Как подключить игру к Telegram

Игра — это статическая страница. Telegram открывает её внутри себя как Mini App. Сервер не нужен.

Адрес игры после включения GitHub Pages будет такой:
`https://deathplectrum.github.io/fantasy-telegram-game/`

## Шаг 1. Включить GitHub Pages (5 минут)

1. Открой https://github.com/deathplectrum/fantasy-telegram-game/settings/pages
2. В разделе **Build and deployment** → **Source** выбери **Deploy from a branch**.
3. **Branch**: выбери `first-playable-version`, папку `/ (root)`, нажми **Save**.
4. Подожди 1–2 минуты и открой адрес выше в браузере. Должна появиться страница «Долг души».

Когда PR #1 будет слит в `main`, переключи ветку на `main` в тех же настройках.

## Шаг 2. Создать бота в BotFather

1. В Telegram найди **@BotFather** и открой чат.
2. Отправь `/newbot`.
3. Введи имя, например: `Долг души`.
4. Введи username, он должен заканчиваться на `bot`, например: `dolg_dushi_bot`. Если занято, придумай другой.
5. BotFather пришлёт токен. Сохрани его в надёжном месте и никому не показывай. Для игры он не нужен, но понадобится, когда появится сервер.

## Шаг 3. Подключить Mini App к боту

1. Отправь BotFather команду `/newapp`.
2. Выбери своего бота из списка.
3. **Title**: `Долг души`.
4. **Description**: одна-две фразы о том, что это за игра.
5. **Photo**: картинку 640×360 (можно пока любую обложку, потом заменишь).
6. **Web App URL**: `https://deathplectrum.github.io/fantasy-telegram-game/`
7. **Short name**: `play`.

BotFather пришлёт ссылку вида `https://t.me/dolg_dushi_bot/play`.

Альтернатива, если нужна кнопка меню у бота: `/mybots` → выбери бота → **Bot Settings** → **Menu Button** → **Configure menu button** → вставь тот же URL.

## Шаг 4. Проверить в Telegram

1. Открой ссылку `https://t.me/dolg_dushi_bot/play` на телефоне.
2. Нажми **Launch**. Игра откроется внутри Telegram.
3. Проверь: выбор пути, вступление, лавка, бой, кнопки «Атака» и «Блок», возврат в город.

Если страница пустая:
- Проверь, что Pages включены и адрес открывается в браузере.
- Очисти кэш Telegram или переустанови клиент.
- Напиши мне, что видно на экране, и я разберусь.
