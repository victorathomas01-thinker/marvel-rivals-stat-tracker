-- SQLite JSON1. :payload contains the extension-validated import.
CREATE TABLE Matches AS
SELECT json_extract(value, '$.id') AS MatchId,
       json_extract(value, '$.outcome') AS Outcome,
       json_extract(value, '$.recordedAt') AS RecordedAt,
       json_extract(value, '$.recordingDate') AS RecordingDateKey,
       json_extract(value, '$.playerScore') AS PlayerScore,
       json_extract(value, '$.opponentScore') AS OpponentScore
FROM json_each(:payload, '$.accepted');
CREATE UNIQUE INDEX match_identity ON Matches(MatchId);

CREATE TABLE MatchHeroes AS
SELECT json_extract(m.value, '$.id') AS MatchId,
       json_extract(h.value, '$.hero') AS Hero,
       count(*) AS AppearanceCount
FROM json_each(:payload, '$.accepted') m,
     json_each(m.value, '$.heroes') h
GROUP BY MatchId, Hero;
CREATE UNIQUE INDEX encounter_identity ON MatchHeroes(MatchId, Hero);

CREATE TABLE Heroes AS SELECT DISTINCT Hero FROM MatchHeroes;
CREATE TABLE RecordingDate AS
SELECT DISTINCT RecordingDateKey,
       CASE WHEN RecordingDateKey = 'Unknown' THEN NULL ELSE RecordingDateKey END AS RecordingDate,
       CASE WHEN RecordingDateKey = 'Unknown' THEN 1 ELSE 0 END AS IsUnknown
FROM Matches;
CREATE TABLE Rejections AS
SELECT json_extract(value, '$.sourceRow') AS SourceRow,
       json_extract(value, '$.matchId') AS MatchId,
       json_extract(value, '$.reason') AS Reason
FROM json_each(:payload, '$.rejected');
