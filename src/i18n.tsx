import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'ru' | 'en';

type Dict = Record<string, string>;
export type Translate = (key: string, params?: Record<string, string | number>) => string;

const RU: Dict = {
  'app.title': 'МАФИЯ',
  'app.subtitle': 'Ночной совет',
  'app.tagline': 'Шесть-двенадцать человек. Один стол. Никто не признается первым.',
  'app.est': 'Нуарная социальная игра',
  'app.footer': 'Браузер. Без установки. Без регистрации.',
  'common.or': 'или',

  'menu.name': 'Ваше имя',
  'menu.namePlaceholder': 'Например, Дон',
  'menu.players': 'Сколько за столом',
  'menu.solo': 'Сесть за стол',
  'menu.soloHint': 'Свободные места займут боты. Партия сразу начнётся.',
  'menu.host': 'Создать комнату',
  'menu.hostHint': 'Ссылка для друзей. Играть можно и без ботов.',
  'menu.join': 'Войти по коду',
  'menu.custom': 'Пользовательская комната',
  'menu.find': 'Найти игру',
  'menu.rules': 'Как играть',
  'menu.roles': 'Состав партии',
  'menu.onlineNote': 'Онлайн идёт напрямую между браузерами через WebRTC. Нужен только код комнаты.',

  'join.title': 'Вход по коду',
  'join.lead': 'Хост прислал вам ссылку или код комнаты.',
  'join.code': 'Код комнаты',
  'join.codePlaceholder': 'k7m2q',
  'join.submit': 'Войти',
  'join.back': 'Назад',
  'join.badCode': 'Код состоит из пяти символов.',
  'join.password': 'Пароль комнаты',
  'join.passwordPlaceholder': 'Пароль от хоста',
  'join.passwordHint': 'Пароль проверяет хост. Он не передаётся другим игрокам и не сохраняется.',
  'join.passwordSubmit': 'Войти с паролем',

  'setup.overline': 'Пользовательская комната',
  'setup.title': 'Настройки комнаты',
  'setup.lead': 'Свои правила, свой состав ролей, свои тайминги. Пароль хранится только у хоста.',
  'setup.roomName': 'Название комнаты',
  'setup.roomNamePlaceholder': 'Например, «Серый переулок»',
  'setup.password': 'Пароль',
  'setup.passwordPlaceholder': 'Необязательно',
  'setup.passwordHint': 'Пароль не показывается в интерфейсе и не попадает в журнал.',
  'setup.usePassword': 'Защитить комнату паролем',
  'setup.maxPlayers': 'Мест за столом',
  'setup.maxPlayersHint': 'Технический максимум — {max}.',
  'setup.roleSet': 'Набор ролей',
  'setup.roleSetStandard': 'Стандартный (6–12 игроков)',
  'setup.roleSetCustom': 'Пользовательский',
  'setup.roleSetHint': 'В пользовательском наборе количество ролей задаёте вы.',
  'setup.allowIncomplete': 'Разрешить неполный состав',
  'setup.allowIncompleteHint': 'Если выключено, игра начнётся только когда игроков ровно столько, сколько ролей.',
  'setup.timers': 'Длительность фаз',
  'setup.night': 'Ночь',
  'setup.discussion': 'Обсуждение',
  'setup.voting': 'Голосование',
  'setup.reveal': 'Показ итогов',
  'setup.seconds': '{n} с',
  'setup.maniacRule': 'Победа маньяка',
  'setup.maniacRuleAlone': 'Остался последним',
  'setup.maniacRuleFaction': 'Все живые — маньяки',
  'setup.maniacRuleHint': 'При двух выживших маньяк не побеждает, если рядом есть кто-то ещё.',
  'setup.manualPhases': 'Ручное управление фазами',
  'setup.openByLink': 'Вход по ссылке',
  'setup.fillWithBots': 'Заполнять места ботами',
  'setup.voice': 'Голосовой чат',
  'setup.resetRoles': 'Вернуть стандартные роли',
  'setup.create': 'Создать комнату',
  'setup.back': 'Назад',
  'setup.as': 'Вы вошли как {name}.',

  'find.overline': 'Подбор комнат',
  'find.title': 'Найти игру',
  'find.lead': 'Открытые комнаты, которые ещё набирают игроков. Комнаты с паролем в подбор не попадают.',
  'find.mode': 'Правила',
  'find.modeAny': 'Любые',
  'find.modeStandard': 'Стандартные',
  'find.modeCustom': 'Пользовательские',
  'find.players': 'Игроков',
  'find.quick': 'Быстрый подбор',
  'find.quickHint': 'Ищем открытую комнату без пароля, которая совместима с выбранными правилами.',
  'find.list': 'Доступные комнаты',
  'find.refresh': 'Обновить',
  'find.loading': 'Загружаем список комнат...',
  'find.empty': 'Пока нет доступных комнат.',
  'find.error': 'Список комнат недоступен.',
  'find.untitled': 'Без названия',
  'find.playersCount': '{n} из {max}',
  'find.rulesStandard': 'Стандартные правила',
  'find.rulesCustom': 'Пользовательские правила',
  'find.locked': 'С паролем',
  'find.status.open': 'Набор игроков',
  'find.status.ready': 'Все готовы',
  'find.status.playing': 'Игра идёт',
  'find.status.full': 'Комната заполнена',
  'find.join': 'Войти',
  'find.as': 'Вы войдёте как {name}.',
  'find.serviceUrl': 'Сервис подбора комнат',
  'find.serviceUrlPlaceholder': 'https://example.com',
  'find.serviceUrlApply': 'Подключить',
  'find.serviceUrlHint': 'Адрес сервиса, который показывает открытые комнаты. Сохраняется в этом браузере.',

  'roleset.total': 'Ролей: {n}',
  'roleset.seats': 'Мест занято: {n}',
  'roleset.count': 'Количество ролей {role}',
  'roleset.plus': 'Добавить роль {role}',
  'roleset.minus': 'Убрать роль {role}',
  'roleset.mismatch': 'Ролей {total}, а игроков {seats}. Числа должны совпадать.',
  'roleset.match': 'Состав совпадает с числом игроков.',

  'rules.title': 'Как играть',
  'rules.p1': 'Каждому раздаётся роль: мафия, доктор, детектив, шериф, маньяк или горожанин.',
  'rules.p2': 'Ночью мафия выбирает жертву, доктор лечит, детектив и шериф проверяют, маньяк убивает.',
  'rules.p3': 'Днём обсуждайте, кто врёт. Голосованием город изгоняет одного игрока.',
  'rules.p4': 'Город побеждает, когда не остаётся ни мафии, ни маньяка. Мафия — когда её не меньше, чем горожан. Маньяк — когда остаётся последним.',
  'rules.p5': 'Роль погибшего раскрывается. В онлайн-партии чужие роли скрыты до смерти.',
  'rules.cityShort': 'город',
  'rules.mafiaShort': 'мафия',
  'rules.maniacShort': 'маньяк',
  'rules.voteRule': 'Изгнание: у кандидата должно быть больше голосов, чем у любого другого, и больше, чем воздержавшихся. При равенстве голосов никто не изгоняется.',
  'rules.voteRuleShort': 'Нужно больше голосов, чем у любого другого кандидата, и больше, чем воздержавшихся. Ничья — никто не изгнан.',
  'rules.close': 'Понятно',

  'lobby.title': 'Лобби',
  'lobby.room': 'Комната',
  'lobby.invite': 'Ссылка для приглашения',
  'lobby.copy': 'Скопировать ссылку',
  'lobby.copied': 'Ссылка скопирована',
  'lobby.start': 'Начать партию',
  'lobby.need': 'Нужно минимум {n} игроков',
  'lobby.addBot': 'Добавить бота',
  'lobby.removeBot': 'Убрать бота',
  'lobby.fill': 'Заполнить ботами',
  'lobby.composition': 'Состав',
  'lobby.players': '{n} за столом',
  'lobby.shareHint': 'Отправьте ссылку друзьям. Они откроют её в браузере и сядут за стол.',
  'lobby.waitingHost': 'Ждём, когда хост начнёт партию.',
  'lobby.empty': 'Пока никого. Пригласите друзей или добавьте ботов.',
  'lobby.leave': 'Выйти',
  'lobby.you': 'вы',
  'lobby.hostTag': 'хост',
  'lobby.botTag': 'бот',
  'lobby.connecting': 'Создаём комнату...',
  'lobby.codeHint': 'Пять символов. Можно продиктовать голосом.',

  'role.mafia.name': 'Мафия',
  'role.doctor.name': 'Доктор',
  'role.detective.name': 'Детектив',
  'role.maniac.name': 'Маньяк',
  'role.citizen.name': 'Горожанин',
  'role.sheriff.name': 'Шериф',
  'role.mafia.desc': 'Ночью вы выбираете жертву вместе с семьёй. Днём — вы самый убедительный горожанин.',
  'role.doctor.desc': 'Каждую ночь спасаете одного человека от смерти. Можно спасти себя.',
  'role.detective.desc': 'Каждую ночь проверяете одного игрока. Вы узнаете, мафия он или нет.',
  'role.sheriff.desc': 'Каждую ночь проверяете одного игрока и узнаёте, входит ли он во враждебную фракцию — мафию или маньяка.',
  'role.maniac.desc': 'Вы играете сами за себя. Каждую ночь убиваете одного человека.',
  'role.citizen.desc': 'У вас нет ночного действия. Ваше оружие — слово и голос.',
  'role.mafia.ability': 'Выбрать жертву',
  'role.doctor.ability': 'Спасти',
  'role.detective.ability': 'Проверить',
  'role.sheriff.ability': 'Проверить',
  'role.maniac.ability': 'Убрать',
  'role.citizen.ability': 'Спать',
  'role.yourRole': 'Ваша роль',
  'role.show': 'Показать роль',
  'role.hide': 'Скрыть',
  'role.secret': 'секретно',
  'role.team': 'Сторона',
  'role.faction.mafia': 'Мафия',
  'role.faction.city': 'Город',
  'role.faction.maniac': 'Одиночка',

  'phase.lobby': 'Лобби',
  'phase.night': 'Ночь',
  'phase.dawn': 'Рассвет',
  'phase.discussion': 'Обсуждение',
  'phase.voting': 'Голосование',
  'phase.execution': 'Приговор',
  'phase.gameover': 'Партия окончена',
  'phase.night.hint': 'Город спит. Просыпаются те, у кого есть дело.',
  'phase.dawn.hint': 'Город узнаёт, кто не пережил ночь.',
  'phase.discussion.hint': 'Говорите. Слушайте. Не верьте никому.',
  'phase.voting.hint': 'Один голос — один приговор.',
  'phase.execution.hint': 'Приговор приведён в исполнение.',
  'phase.gameover.hint': 'Роли раскрыты. Партия окончена.',

  'table.day': 'День {n}',
  'table.night': 'Ночь {n}',
  'table.alive': 'Живых: {n}',
  'table.yourTurn': 'Ваш ход',
  'table.sleep': 'Город спит',
  'table.sleepHint': 'Дождитесь рассвета.',
  'table.chooseTarget': 'Выберите цель на столе',
  'table.target': 'Цель: {name}',
  'table.confirm': 'Подтвердить',
  'table.cancel': 'Отмена',
  'table.chosen': 'Выбор сделан',
  'table.waitOthers': 'Ждём остальных',
  'table.vote': 'Голосовать',
  'table.abstain': 'Воздержаться',
  'table.yourVote': 'Ваш голос: {name}',
  'table.voteCount': '{n} голосов',
  'table.skipToVote': 'К голосованию',
  'table.next': 'Дальше',
  'table.readyWaiting': 'Ждём остальных...',
  'table.hostSkip': 'Пропустить фазу',
  'table.leave': 'Выйти',
  'table.log': 'Хроника',
  'table.chat': 'Чат',
  'table.chatPlaceholder': 'Сказать что-нибудь...',
  'table.chatNight': 'Ночью говорят только мафия.',
  'table.chatDead': 'Мёртвые говорят шёпотом.',
  'table.chatSend': 'Отправить',
  'table.checks': 'Ваши проверки',
  'table.check.mafia': 'мафия',
  'table.check.clean': 'чист',
  'table.family': 'Семья',
  'table.dead': 'Мёртв',
  'table.deadRole': 'роль: {role}',
  'table.seat': 'Место {n}',
  'table.you': 'вы',
  'table.roleHidden': 'Роль скрыта',
  'table.spectator': 'Вы наблюдаете',
  'table.logEmpty': 'Пока тихо.',
  'table.mafiaVotes': 'Выбор семьи',
  'table.playerVoted': 'голос учтён',
  'table.votesTitle': 'Голоса',
  'table.ready': 'Готов',
  'table.readyHint': 'Нажмите, когда закончите обсуждение.',
  'table.spectatorHint': 'Партия продолжается без вас.',
  'table.kickHint': 'Нажмите на игрока, чтобы выбрать цель.',
  'table.phaseHint': 'Осталось',
  'table.confirmNight': 'Подтвердить выбор',
  'table.nightConfirmHint': 'Выбор применяется после подтверждения. До конца ночи его можно изменить.',
  'table.nightLocked': 'Все роли сделали выбор. Его ещё можно изменить в коротком окне.',
  'table.nightChangeHint': 'Нажмите на игрока, чтобы изменить выбор.',
  'table.manualPhases': 'ручные фазы',
  'table.check.maniac': 'маньяк',

  'lobby.ready': 'Готов',
  'lobby.unready': 'Не готов',
  'lobby.readyTag': 'готов',
  'lobby.notReadyTag': 'не готов',
  'lobby.botReady': 'готов',
  'lobby.readyCount': '{ready} из {total} готовы',
  'lobby.waitReady': 'Ждём готовности: {ready} из {total}.',
  'lobby.needSeats': 'Нужно {seats} игроков, ролей в составе {total}.',
  'lobby.settings': 'Настройки комнаты',
  'lobby.passwordApply': 'Сменить пароль',
  'lobby.passwordRemove': 'Убрать пароль',
  'lobby.passwordSet': 'Пароль задан',
  'lobby.kickAsk': 'Исключить',
  'lobby.kickTitle': 'Исключить {name}?',
  'lobby.kickTitleShort': 'Исключение игрока',
  'lobby.kickMeta': 'За: {yes} · Против: {no} · Нужно для прохождения: {quorum}',
  'lobby.kickYes': 'За',
  'lobby.kickNo': 'Против',
  'lobby.kickNone': 'Некого исключать.',

  'voice.title': 'Голос',
  'voice.start': 'Включить микрофон',
  'voice.stop': 'Выключить микрофон',
  'voice.on': 'Микрофон',
  'voice.off': 'Микрофон',
  'voice.mute': 'Отключить звук',
  'voice.unmute': 'Включить звук',
  'voice.closed': 'Сейчас микрофон недоступен: голос только во время обсуждения.',
  'voice.speaking': 'Говорят: {names}',
  'voice.warning': 'Голос передаётся участникам комнаты и не записывается.',
  'voice.denied': 'Доступ к микрофону не выдан.',
  'voice.notNow': 'Сейчас говорить нельзя.',
  'voice.connection': 'Голосовое соединение не удалось.',

  'report.nightTitle': 'Итоги ночи',
  'report.deathsTitle': 'Погибли',
  'report.noDeaths': 'Этой ночью никто не погиб.',
  'report.saved': 'Кто-то был спасён.',
  'report.voteTitle': 'Итоги голосования',
  'report.executed': 'Изгнан: {name}',
  'report.noExecution': 'Никто не изгнан: голоса разделились.',
  'report.abstains': 'Воздержались: {n}',
  'report.role': 'роль: {role}',

  'gameover.win.city': 'Город победил',
  'gameover.win.mafia': 'Мафия победила',
  'gameover.win.maniac': 'Маньяк победил',
  'gameover.youWon': 'Вы победили',
  'gameover.youLost': 'Вы проиграли',
  'gameover.neutral': 'Партия окончена',
  'gameover.reveal': 'Роли за столом',
  'gameover.again': 'Ещё партия',
  'gameover.menu': 'В меню',
  'gameover.waitHost': 'Хост может начать новую партию.',
  'gameover.leave': 'Покинуть стол',

  'log.night': 'Ночь {day}. Город засыпает.',
  'log.dawn': 'Рассвет {day}.',
  'log.discussion': 'Обсуждение. У города есть время, чтобы найти ложь.',
  'log.voteStarted': 'Голосование. Кто покинет стол?',
  'log.joined': '{name} садится за стол. Место {seat}.',
  'log.left': '{name} покидает стол.',
  'log.started': 'Партия началась. За столом {count} человек.',
  'log.killed': 'Тело: {name}. Роль: {role}.',
  'log.noDeath': 'Этой ночью никто не погиб.',
  'log.savedPrivate': 'Вы спасли {name} этой ночью.',
  'log.check.mafia': 'Проверка: {name} — мафия.',
  'log.check.clean': 'Проверка: {name} — не мафия.',
  'log.voted': '{name} голосует против {target}.',
  'log.abstained': '{name} воздерживается.',
  'log.executed': 'Голосование изгоняет: {name}. Роль: {role}.',
  'log.noExecution': 'Голоса разделились. Никто не изгнан.',
  'log.autopilot': '{name} потерял связь. За него играет бот.',
  'log.autoReady': '{name} отвечает автоматически.',
  'log.restart': 'Новая партия. Роли будут розданы заново.',
  'log.win.city': 'Город победил. Мафии и маньяка больше нет.',
  'log.win.mafia': 'Мафия победила. Город пал.',
  'log.win.maniac': 'Маньяк победил. Он остался последним.',
  'log.settingsChanged': 'Настройки комнаты изменены. Готовность сброшена.',
  'log.compositionChanged': 'Состав ролей изменён: {total}.',
  'log.nightLocked': 'Все роли сделали выбор.',
  'log.mafiaSplit': 'Семья не договорилась — этой ночью никто не погибнет.',
  'log.kickStarted': '{by} предлагает исключить {name}.',
  'log.kickVote': '{name} проголосовал: {choice}.',
  'log.kickPassed': 'Голосование прошло. {name} покидает стол.',
  'log.kickFailed': 'Голосование не набрало нужного числа голосов.',
  'chat.entry': '{name}:',

  'bot.suspect': '{name} слишком тихо себя ведёт.',
  'bot.accuse': '{name} голосует слишком уверенно.',
  'bot.nervous': '{name} нервничает. Это видно.',
  'bot.role': 'Я бы начал с {name}.',
  'bot.quiet': 'Ночь была долгой. Кто-то здесь врёт.',
  'bot.defend': 'Я чист. Не тратьте на меня голос.',

  'net.connecting': 'Соединяемся...',
  'net.hostLeft': 'Хост закрыл комнату.',
  'net.closed': 'Соединение потеряно.',
  'net.error': 'Не удалось подключиться.',
  'net.server': 'Сигнальный сервер недоступен. Попробуйте позже.',
  'net.notFound': 'Комната не найдена. Проверьте код.',
  'net.full': 'Комната заполнена или партия уже началась.',
  'net.timeout': 'Соединение не установилось. Попробуйте ещё раз.',
  'net.copyFail': 'Не удалось скопировать. Скопируйте вручную.',
  'net.passwordRequired': 'Комната защищена паролем.',
  'net.wrongPassword': 'Неверный пароль.',
  'net.discovery': 'Сервис подбора недоступен. Попробуйте позже.',
  'net.noDiscovery': 'Список комнат недоступен: сервис подбора не настроен.',

  'err.phase': 'Сейчас это действие недоступно.',
  'err.host': 'Это может сделать только хост.',
  'err.players': 'Нужно минимум 6 игроков.',
  'err.full': 'За столом уже 12 игроков.',
  'err.role': 'У вас нет такого действия.',
  'err.target': 'Эту цель выбрать нельзя.',
  'err.self': 'Нельзя выбрать себя.',
  'err.dead': 'Мёртвые только наблюдают.',
  'err.manual': 'Хост не может пропускать фазы: ручное управление выключено.',
  'err.composition': 'Состав ролей не подходит: проверьте количество ролей и игроков.',
  'err.notReady': 'Не все игроки подтвердили готовность.',
  'err.voteOpen': 'Голосование уже идёт.',
  'err.voteClosed': 'Голосование завершено.',
  'err.cooldown': 'Слишком часто. Подождите немного.',
  'err.unknown': 'Что-то пошло не так.',

  'lang.ru': 'RU',
  'lang.en': 'EN',
  'aria.lang': 'Язык интерфейса',
  'aria.copy': 'Скопировать ссылку',
  'aria.leave': 'Выйти из партии',
  'aria.seat': '{name}, место {n}',
  'aria.target': 'Выбрать целью {name}',
  'aria.close': 'Закрыть',
  'aria.chat': 'Поле чата',
};



/**
 * The English strings live in their own module and are loaded on demand —
 * that keeps the first chunk small for the default Russian interface.
 */
let english: Dict | null = null;

export function hasEnglish(): boolean {
  return english !== null;
}

export async function loadEnglish(): Promise<void> {
  if (english) return;
  const module = await import('./i18n.en');
  english = module.EN;
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = locale === 'en' ? english : RU;
  const template = dict?.[key] ?? RU[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  setLocale,
  children,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(() => locale !== 'en' || hasEnglish());

  useEffect(() => {
    if (locale !== 'en' || hasEnglish()) {
      setReady(true);
      return;
    }
    let alive = true;
    void loadEnglish().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  const t = useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    [locale, ready],
  );
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function roleName(t: Translate, role: string): string {
  return t(`role.${role}.name`);
}

export function roleDesc(t: Translate, role: string): string {
  return t(`role.${role}.desc`);
}

export function roleFaction(t: Translate, role: string): string {
  const faction =
    role === 'mafia' ? 'mafia' : role === 'maniac' ? 'maniac' : 'city';
  return t(`role.faction.${faction}`);
}

/** Resolves a log entry, translating nested role params. */
export function logText(
  t: Translate,
  code: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return t(code);
  const resolved: Record<string, string | number> = { ...params };
  if (typeof resolved.role === 'string') {
    resolved.role = t(`role.${resolved.role}.name`);
  }
  return t(code, resolved);
}
