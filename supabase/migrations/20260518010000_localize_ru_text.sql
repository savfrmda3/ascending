update public.quest_templates
set title = case title
    when '20 push-ups' then '20 отжиманий'
    when '30 squats' then '30 приседаний'
    when '15 minutes stretching' then '15 минут растяжки'
    when '30 minutes workout' then '30 минут тренировки'
    when 'Read 10 pages' then 'Прочитать 10 страниц'
    when 'Study English for 30 minutes' then '30 минут английского'
    when 'Watch educational video' then 'Посмотреть обучающее видео'
    when 'Complete one lesson' then 'Пройти один урок'
    when 'Drink 2 liters of water' then 'Выпить 2 литра воды'
    when 'Sleep before target time' then 'Лечь спать вовремя'
    when 'Walk 7000 steps' then 'Пройти 7000 шагов'
    when 'Prepare healthy meal' then 'Приготовить полезный прием пищи'
    when 'Clean workspace' then 'Убрать рабочее место'
    when 'Plan tomorrow' then 'Спланировать завтра'
    when 'Complete one delayed task' then 'Закрыть одну отложенную задачу'
    when 'Wake up on time' then 'Проснуться вовремя'
    when '30 minutes deep work' then '30 минут глубокой работы'
    when 'No social media for 1 hour' then '1 час без соцсетей'
    when 'Pomodoro session x2' then 'Две Pomodoro-сессии'
    when 'Finish one important task' then 'Завершить одну важную задачу'
    when 'Message one useful contact' then 'Написать полезному контакту'
    when 'Practice speaking for 10 minutes' then '10 минут практики речи'
    when 'Record a short voice note' then 'Записать короткое голосовое'
    when 'Give someone a compliment' then 'Сделать комплимент'
    else title
  end,
  description = case description
    when 'Complete 20 controlled push-ups.' then 'Выполни 20 техничных отжиманий.'
    when 'Complete 30 bodyweight squats.' then 'Выполни 30 приседаний с собственным весом.'
    when 'Spend 15 minutes on mobility or stretching.' then 'Потрать 15 минут на мобильность или растяжку.'
    when 'Train for 30 minutes with steady effort.' then 'Тренируйся 30 минут в ровном темпе.'
    when 'Read 10 pages from a useful book.' then 'Прочитай 10 страниц полезной книги.'
    when 'Complete focused English study for 30 minutes.' then 'Позанимайся английским 30 минут без отвлечений.'
    when 'Watch and summarize one educational video.' then 'Посмотри и кратко законспектируй одно обучающее видео.'
    when 'Finish one course lesson or tutorial module.' then 'Заверши один урок курса или модуль туториала.'
    when 'Reach your daily water target.' then 'Закрой дневную норму воды.'
    when 'Start your sleep routine before your target time.' then 'Начни подготовку ко сну до выбранного времени.'
    when 'Walk at least 7000 steps today.' then 'Пройди сегодня минимум 7000 шагов.'
    when 'Prepare one meal that supports your energy.' then 'Приготовь один прием пищи, который поддержит энергию.'
    when 'Reset your workspace before the next session.' then 'Приведи рабочее место в порядок перед следующей сессией.'
    when 'Write the three most important tasks for tomorrow.' then 'Запиши три самые важные задачи на завтра.'
    when 'Finish one task you have postponed.' then 'Заверши одну задачу, которую откладывал.'
    when 'Wake up at your planned time.' then 'Проснись в запланированное время.'
    when 'Complete one uninterrupted deep work block.' then 'Проведи один непрерывный блок глубокой работы.'
    when 'Stay away from social feeds for one full hour.' then 'Не заходи в ленты соцсетей один полный час.'
    when 'Complete two Pomodoro focus sessions.' then 'Заверши две Pomodoro-сессии фокуса.'
    when 'Finish one meaningful task before switching context.' then 'Заверши одну значимую задачу перед переключением контекста.'
    when 'Send one thoughtful message to a useful contact.' then 'Отправь одно осмысленное сообщение полезному контакту.'
    when 'Practice speaking clearly for 10 minutes.' then 'Практикуй четкую речь 10 минут.'
    when 'Record a short voice note and listen back once.' then 'Запиши короткое голосовое и один раз прослушай его.'
    when 'Give one sincere compliment today.' then 'Сделай сегодня один искренний комплимент.'
    else description
  end
where title in (
  '20 push-ups',
  '30 squats',
  '15 minutes stretching',
  '30 minutes workout',
  'Read 10 pages',
  'Study English for 30 minutes',
  'Watch educational video',
  'Complete one lesson',
  'Drink 2 liters of water',
  'Sleep before target time',
  'Walk 7000 steps',
  'Prepare healthy meal',
  'Clean workspace',
  'Plan tomorrow',
  'Complete one delayed task',
  'Wake up on time',
  '30 minutes deep work',
  'No social media for 1 hour',
  'Pomodoro session x2',
  'Finish one important task',
  'Message one useful contact',
  'Practice speaking for 10 minutes',
  'Record a short voice note',
  'Give someone a compliment'
);

update public.weekly_bosses
set name = 'Пожиратель фокуса',
  description = 'Сущность давления, которая слабеет, когда ты защищаешь блоки глубокой работы.',
  objective = 'Заверши 4 сессии глубокой работы.'
where name = 'Devourer of Focus';

update public.achievements
set title = case key
    when 'first_quest' then 'Первый квест'
    when 'streak_3' then 'Серия 3 дня'
    when 'streak_7' then 'Серия 7 дней'
    when 'first_level_up' then 'Первое повышение'
    when 'boss_slayer' then 'Победитель босса'
    when 'focus_hunter' then 'Охотник фокуса'
    when 'discipline_initiate' then 'Адепт дисциплины'
    else title
  end,
  description = case key
    when 'first_quest' then 'Выполни первый ежедневный квест.'
    when 'streak_3' then 'Выполняй квесты три дня подряд.'
    when 'streak_7' then 'Выполняй квесты семь дней подряд.'
    when 'first_level_up' then 'Получи новый уровень впервые.'
    when 'boss_slayer' then 'Победи первого недельного босса.'
    when 'focus_hunter' then 'Выполни 10 квестов фокуса.'
    when 'discipline_initiate' then 'Выполни 10 квестов дисциплины.'
    else description
  end
where key in (
  'first_quest',
  'streak_3',
  'streak_7',
  'first_level_up',
  'boss_slayer',
  'focus_hunter',
  'discipline_initiate'
);

update public.users
set current_title = 'Охотник фокуса'
where current_title = 'Focus Hunter';
