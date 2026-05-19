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

update public.quest_templates
set
  estimated_minutes = case difficulty when 'easy' then 10 when 'medium' then 30 else 60 end,
  tags = case
    when title in ('Проснуться вовремя', 'Спланировать завтра') then array['morning', 'planning']
    when title in ('Лечь спать вовремя') then array['sleep', 'recovery']
    when title in ('Приготовить полезный прием пищи', 'Выпить 2 литра воды') then array['nutrition']
    when category in ('focus', 'intelligence') then array['work_study']
    when category = 'charisma' then array['social']
    when category = 'vitality' then array['recovery']
    when category = 'strength' then array['movement']
    else array['planning']
  end,
  reason = 'Базовый шаблон дневной системы: поддерживает рост характеристики ' || stat_reward_key || '.';

insert into public.quest_templates
  (title, description, category, difficulty, xp_reward, stat_reward_key, stat_reward_value, estimated_minutes, tags, reason)
values
  ('Открыть день без телефона', 'Первые 20 минут после подъема не открывай соцсети и ленты.', 'discipline', 'easy', 15, 'discipline', 1, 20, array['morning', 'digital_hygiene'], 'Укрепляет утренний контроль внимания.'),
  ('Записать цель дня', 'Сформулируй одну главную цель дня и первый шаг к ней.', 'discipline', 'easy', 15, 'discipline', 1, 7, array['morning', 'planning'], 'Помогает системе выбрать фокус дня.'),
  ('Утренняя разминка 8 минут', 'Сделай мягкую разминку для спины, шеи и плеч.', 'vitality', 'easy', 15, 'vitality', 1, 8, array['morning', 'movement', 'recovery'], 'Поднимает энергию без перегруза.'),
  ('Белковый завтрак', 'Собери завтрак с нормальным источником белка.', 'vitality', 'easy', 15, 'vitality', 1, 15, array['nutrition', 'morning'], 'Стабилизирует энергию первой половины дня.'),
  ('Подготовить воду на рабочее место', 'Поставь рядом воду и выпей первый стакан.', 'vitality', 'easy', 15, 'vitality', 1, 5, array['nutrition'], 'Снижает шанс провала vitality-квестов.'),
  ('Глубокая работа 45 минут', 'Закрой один важный блок без переключения контекста.', 'focus', 'hard', 75, 'focus', 2, 45, array['work_study'], 'Сложный фокус-блок даёт высокий вклад в босса недели.'),
  ('Один учебный конспект', 'Сделай короткий конспект по теме, которую изучаешь.', 'intelligence', 'medium', 35, 'intelligence', 1, 25, array['work_study'], 'Укрепляет обучение через активное вспоминание.'),
  ('Разобрать одну ошибку', 'Найди одну ошибку в учебе/работе и запиши вывод.', 'intelligence', 'medium', 35, 'intelligence', 1, 20, array['work_study'], 'Прокачивает мышление через обратную связь.'),
  ('Закрыть один micro-task', 'Закрой маленькую задачу, которая занимает меньше 10 минут.', 'discipline', 'easy', 15, 'discipline', 1, 10, array['planning', 'work_study'], 'Убирает накопленное трение.'),
  ('Очистить входящие', 'Разбери сообщения или задачи до понятного следующего действия.', 'discipline', 'medium', 35, 'discipline', 1, 25, array['digital_hygiene', 'planning'], 'Снижает ментальный шум.'),
  ('Час без коротких видео', 'Не открывай короткие видео и бесконечные ленты один час.', 'focus', 'easy', 15, 'focus', 1, 60, array['digital_hygiene'], 'Защищает внимание от дешёвого дофамина.'),
  ('Поставить лимит на приложение', 'Поставь или проверь лимит на главный отвлекающий сервис.', 'discipline', 'easy', 15, 'discipline', 1, 5, array['digital_hygiene'], 'Создаёт внешний барьер для отвлечений.'),
  ('Вечерний shutdown', 'Запиши, что сделано, и закрой рабочий день.', 'discipline', 'medium', 35, 'discipline', 1, 15, array['planning', 'recovery'], 'Помогает восстановлению и удержанию ритма.'),
  ('Подготовить сон', 'За 30 минут до сна убери яркие экраны и подготовь комнату.', 'vitality', 'medium', 35, 'vitality', 1, 30, array['sleep', 'recovery'], 'Сон напрямую усиливает HP и Energy.'),
  ('Легкая прогулка восстановления', 'Пройди спокойным шагом 15 минут без наушников.', 'vitality', 'easy', 15, 'vitality', 1, 15, array['recovery', 'movement'], 'Восстанавливает нервную систему.'),
  ('Тренировка корпуса', 'Сделай 3 подхода планки или упражнений на корпус.', 'strength', 'medium', 35, 'strength', 1, 20, array['movement'], 'Развивает силовую базу.'),
  ('Интервальная тренировка', 'Сделай короткую интенсивную тренировку с разминкой.', 'strength', 'hard', 75, 'strength', 2, 35, array['movement'], 'Требует энергии, но даёт сильный прирост STR.'),
  ('Растяжка перед сном', 'Проведи 10 минут в спокойной растяжке.', 'vitality', 'easy', 15, 'vitality', 1, 10, array['sleep', 'recovery'], 'Помогает восстановлению после сложного дня.'),
  ('Написать благодарность', 'Напиши человеку короткое искреннее спасибо.', 'charisma', 'easy', 15, 'charisma', 1, 5, array['social'], 'Укрепляет социальные связи без давления.'),
  ('Позвать человека на разговор', 'Предложи короткий созвон или встречу полезному контакту.', 'charisma', 'medium', 35, 'charisma', 1, 10, array['social'], 'Тренирует инициативу в коммуникации.'),
  ('Сложный разговор без откладывания', 'Аккуратно начни разговор, который давно откладывал.', 'charisma', 'hard', 75, 'charisma', 2, 30, array['social'], 'Высокая сложность за реальную социальную смелость.'),
  ('Собрать план питания на завтра', 'Запиши 2-3 простых приема пищи на завтра.', 'vitality', 'easy', 15, 'vitality', 1, 10, array['nutrition', 'planning'], 'Заранее снижает шанс случайного питания.'),
  ('Сделать один шаг к проекту', 'Открой проект и сделай минимальный полезный шаг.', 'focus', 'medium', 35, 'focus', 1, 25, array['work_study'], 'Создаёт импульс в ключевой задаче.'),
  ('Повторить материал по памяти', 'Без подсказок запиши всё, что помнишь по изучаемой теме.', 'intelligence', 'hard', 75, 'intelligence', 2, 40, array['work_study'], 'Сильный метод обучения через recall.')
on conflict (title, category, difficulty) do update set
  description = excluded.description,
  xp_reward = excluded.xp_reward,
  stat_reward_key = excluded.stat_reward_key,
  stat_reward_value = excluded.stat_reward_value,
  estimated_minutes = excluded.estimated_minutes,
  tags = excluded.tags,
  reason = excluded.reason,
  is_active = true;
