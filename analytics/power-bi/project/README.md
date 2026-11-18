# Editable Power BI project template

This is the native PBIR/TMDL source saved by Desktop, with its machine-specific JSON path replaced by `__MODEL_JSON__`. Local caches, query/script tabs, editor state, and Fabric item metadata are excluded from Git. The acceptance query is maintained as `../validate_model.dax`; create a new DAX Query View tab and paste it there after refreshing.

Run `python analytics/power-bi/prepare_project.py` from the repository root before opening a source project. It builds data, copies this template to ignored `generated/project`, binds the local model path, and regenerates the report pages. Open the printed PBIP path and choose Refresh in Desktop. Save any customized report into a separate folder before rerunning preparation.

For immediate viewing without refresh or setup, open the PBIX in `../demo` instead. The PDF and PNGs are visual previews. Power BI's PDF export is untagged and should not be treated as an accessible document replacement for the native report.
