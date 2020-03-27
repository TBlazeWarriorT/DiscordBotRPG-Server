SET autocommit = OFF;

INSERT INTO monstres
VALUES
(114, 0, 3);

INSERT INTO localizationmonsters
VALUES
('114', 'en', 'Dragon of Death'),
('114', 'pt-BR', 'Dragão da Morte');

INSERT INTO statsprofil
VALUES
(11, 'death');

INSERT INTO statsrepartition
VALUES
(11, 1, 96),
(11, 3, 96),
(11, 5, 50),
(11, 7, 100),
(11, 9, 50);

INSERT INTO statsmonstres
VALUES
(114, 11);

INSERT INTO monstresgroupes
VALUES
(107, 114, 1);

INSERT INTO areasmonsters
VALUES
(47, 107, 114);

COMMIT;