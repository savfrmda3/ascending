insert into public.quest_templates
  (title, description, category, difficulty, xp_reward, stat_reward_key, stat_reward_value)
values
  ('20 push-ups', 'Complete 20 controlled push-ups.', 'strength', 'easy', 15, 'strength', 1),
  ('30 squats', 'Complete 30 bodyweight squats.', 'strength', 'easy', 15, 'strength', 1),
  ('15 minutes stretching', 'Spend 15 minutes on mobility or stretching.', 'strength', 'easy', 15, 'strength', 1),
  ('30 minutes workout', 'Train for 30 minutes with steady effort.', 'strength', 'medium', 35, 'strength', 1),
  ('Read 10 pages', 'Read 10 pages from a useful book.', 'intelligence', 'easy', 15, 'intelligence', 1),
  ('Study English for 30 minutes', 'Complete focused English study for 30 minutes.', 'intelligence', 'medium', 35, 'intelligence', 1),
  ('Watch educational video', 'Watch and summarize one educational video.', 'intelligence', 'easy', 15, 'intelligence', 1),
  ('Complete one lesson', 'Finish one course lesson or tutorial module.', 'intelligence', 'medium', 35, 'intelligence', 1),
  ('Drink 2 liters of water', 'Reach your daily water target.', 'vitality', 'easy', 15, 'vitality', 1),
  ('Sleep before target time', 'Start your sleep routine before your target time.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Walk 7000 steps', 'Walk at least 7000 steps today.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Prepare healthy meal', 'Prepare one meal that supports your energy.', 'vitality', 'medium', 35, 'vitality', 1),
  ('Clean workspace', 'Reset your workspace before the next session.', 'discipline', 'easy', 15, 'discipline', 1),
  ('Plan tomorrow', 'Write the three most important tasks for tomorrow.', 'discipline', 'easy', 15, 'discipline', 1),
  ('Complete one delayed task', 'Finish one task you have postponed.', 'discipline', 'medium', 35, 'discipline', 1),
  ('Wake up on time', 'Wake up at your planned time.', 'discipline', 'easy', 15, 'discipline', 1),
  ('30 minutes deep work', 'Complete one uninterrupted deep work block.', 'focus', 'medium', 35, 'focus', 1),
  ('No social media for 1 hour', 'Stay away from social feeds for one full hour.', 'focus', 'easy', 15, 'focus', 1),
  ('Pomodoro session x2', 'Complete two Pomodoro focus sessions.', 'focus', 'medium', 35, 'focus', 1),
  ('Finish one important task', 'Finish one meaningful task before switching context.', 'focus', 'hard', 75, 'focus', 1),
  ('Message one useful contact', 'Send one thoughtful message to a useful contact.', 'charisma', 'easy', 15, 'charisma', 1),
  ('Practice speaking for 10 minutes', 'Practice speaking clearly for 10 minutes.', 'charisma', 'easy', 15, 'charisma', 1),
  ('Record a short voice note', 'Record a short voice note and listen back once.', 'charisma', 'easy', 15, 'charisma', 1),
  ('Give someone a compliment', 'Give one sincere compliment today.', 'charisma', 'easy', 15, 'charisma', 1)
on conflict do nothing;
