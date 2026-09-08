-- Roll back application code only; retain this additive table so user learning progress is not lost.
SELECT COUNT(*) AS retained_learning_progress FROM toolbox_study_progress;
