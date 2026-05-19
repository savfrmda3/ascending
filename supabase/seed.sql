insert into public.quest_templates
  (title, description, category, difficulty, xp_reward, stat_reward_key, stat_reward_value)
values
  ('20 отжиманий', 'Выполни 20 техничных отжиманий.', 'strength', 'easy', 15, 'strength', 1),
  ('30 приседаний', 'Выполни 30 приседаний с собственным весом.', 'strength', 'easy', 15, 'strength', 1),
  ('15 минут растяжки', 'Потрать 15 минут на мобильность или растяжку.', 'strength', 'easy', 15, 'strength', 1),
  ('30 минут тренировки', 'Тренируйся 30 минут в ровном темпе.', 'strength', 'medium', 35, 'strength', 1),
  ('Прочитать 10 страниц', 'Прочитай 10 страниц полезной книги.', 'intelligence', 'easy', 15, 'intelligence', 1),
  ('30 минут английского', 'Позанимайся английским 30 минут без отвлечений.', 'intelligence', 'medium', 35, 'intelligence', 1),
  ('Посмотреть обучающее видео', 'Посмотри и кратко законспектируй одно обучающее видео.', 'intelligence', 'easy', 15, 'intelligence', 1),
  ('Пройти один урок', 'Заверши один урок курса или модуль туториала.', 'intelligence', 'medium', 35, 'intelligence', 1),
  ('Выпить 2 литра воды', 'Закрой дневную норму воды.', 'vitality', 'easy', 15, 'vitality', 1),
  ('Лечь спать вовремя', 'Начни подготовку ко сну до выбранного времени.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Пройти 7000 шагов', 'Пройди сегодня минимум 7000 шагов.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Приготовить полезный прием пищи', 'Приготовь один прием пищи, который поддержит энергию.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Убрать рабочее место', 'Приведи рабочее место в порядок перед следующей сессией.', 'discipline', 'easy', 15, 'discipline', 1),
  ('Спланировать завтра', 'Запиши три самые важные задачи на завтра.', 'discipline', 'easy', 15, 'discipline', 1),
  ('Закрыть одну отложенную задачу', 'Заверши одну задачу, которую откладывал.', 'discipline', 'medium', 35, 'discipline', 1),
  ('Проснуться вовремя', 'Проснись в запланированное время.', 'discipline', 'easy', 15, 'discipline', 1),
  ('30 минут глубокой работы', 'Проведи один непрерывный блок глубокой работы.', 'focus', 'medium', 35, 'focus', 1),
  ('1 час без соцсетей', 'Не заходи в ленты соцсетей один полный час.', 'focus', 'easy', 15, 'focus', 1),
  ('Две Pomodoro-сессии', 'Заверши две Pomodoro-сессии фокуса.', 'focus', 'medium', 35, 'focus', 1),
  ('Завершить одну важную задачу', 'Заверши одну значимую задачу перед переключением контекста.', 'focus', 'hard', 75, 'focus', 1),
  ('Написать полезному контакту', 'Отправь одно осмысленное сообщение полезному контакту.', 'charisma', 'easy', 15, 'charisma', 1),
  ('10 минут практики речи', 'Практикуй четкую речь 10 минут.', 'charisma', 'easy', 15, 'charisma', 1),
  ('Записать короткое голосовое', 'Запиши короткое голосовое и один раз прослушай его.', 'charisma', 'easy', 15, 'charisma', 1),
  ('Сделать комплимент', 'Сделай сегодня один искренний комплимент.', 'charisma', 'easy', 15, 'charisma', 1)
on conflict (title, category, difficulty) do update set
  description = excluded.description,
  xp_reward = excluded.xp_reward,
  stat_reward_key = excluded.stat_reward_key,
  stat_reward_value = excluded.stat_reward_value,
  is_active = true;
