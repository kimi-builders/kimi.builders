-- 名称砖红档下线(20260918):红卡实测观感不佳,色板收敛为 跟随主题/绿/蓝/黑;
-- 存量 red(含 20260916 由暖色档归并来的)并入黑卡。注册表与 globals.css
-- 同步删档;works.cover_tone 白名单读注册表,red 不再是合法值。
UPDATE works SET cover_tone = 'black' WHERE cover_tone = 'red';
