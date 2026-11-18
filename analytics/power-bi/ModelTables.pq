// Create a blank query named ModelTables, paste this into Advanced Editor,
// and replace ModelPath with the absolute path to generated/model.json.
let
    ModelPath = "C:\REPLACE_ME\generated\model.json",
    Source = Json.Document(File.Contents(ModelPath)),
    Typed = (name as text, columns as list, types as list) as table =>
        Table.TransformColumnTypes(
            Table.FromRecords(Record.Field(Source, name), columns, MissingField.UseNull), types, "en-US"),
    Matches = Typed("Matches",
        {"MatchId", "Outcome", "RecordedAt", "RecordingDateKey", "PlayerScore", "OpponentScore"},
        {{"MatchId", type text}, {"Outcome", type text}, {"RecordedAt", type datetimezone},
         {"RecordingDateKey", type text}, {"PlayerScore", Int64.Type}, {"OpponentScore", Int64.Type}}),
    Heroes = Typed("Heroes", {"Hero"}, {{"Hero", type text}}),
    MatchHeroes = Typed("MatchHeroes", {"MatchId", "Hero", "AppearanceCount"},
        {{"MatchId", type text}, {"Hero", type text}, {"AppearanceCount", Int64.Type}}),
    RecordingDate = Typed("RecordingDate", {"RecordingDateKey", "RecordingDate", "IsUnknown"},
        {{"RecordingDateKey", type text}, {"RecordingDate", type date}, {"IsUnknown", Int64.Type}}),
    Rejections = Typed("Rejections", {"SourceRow", "MatchId", "Reason"},
        {{"SourceRow", Int64.Type}, {"MatchId", type text}, {"Reason", type text}}),
    ImportSummary = Typed("ImportSummary", {"SourceRows", "AcceptedRows", "RejectedRows"},
        {{"SourceRows", Int64.Type}, {"AcceptedRows", Int64.Type}, {"RejectedRows", Int64.Type}})
in
    [Matches = Matches, Heroes = Heroes, MatchHeroes = MatchHeroes,
     RecordingDate = RecordingDate, Rejections = Rejections, ImportSummary = ImportSummary]
