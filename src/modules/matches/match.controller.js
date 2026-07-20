const matchService = require("./match.service");
const playerService = require("../player/player.service");
const answerService = require("../player/answer.service");
const tieBreakerService = require("./tieBreaker.service");
const {
  getAnswerQueryValidation,
  reopenAnswerValidation,
} = require("../player/answer.validation");
const {
  cancelMatchValidation,
  confirmMatchValidation,
  createMatchValidation,
  getMatchesQueryValidation,
  jumpQuestionValidation,
  removeTeamValidation,
  startIntermissionValidation,
  validate,
} = require("./match.validation");

async function createMatch(req, res, next) {
  try {
    const payload = validate(createMatchValidation, req.body);
    const match = await matchService.createMatch(payload, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Match created successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmMatch(req, res, next) {
  try {
    validate(confirmMatchValidation, req.body);
    const match = await matchService.confirmMatch(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Match confirmed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyActiveMatch(req, res, next) {
  try {
    const match = await matchService.getMyActiveMatch(req.user.id);

    return res.status(200).json({
      success: true,
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMatchById(req, res, next) {
  try {
    const match = await matchService.getMatchById(req.params.id, req.user);

    return res.status(200).json({
      success: true,
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function startMatch(req, res, next) {
  try {
    const match = await matchService.startMatch(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Match started successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function openCurrentQuestion(req, res, next) {
  try {
    const match = await matchService.openCurrentQuestion(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Question opened successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function closeCurrentQuestion(req, res, next) {
  try {
    const match = await matchService.closeCurrentQuestion(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Question closed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function revealCurrentAnswer(req, res, next) {
  try {
    const match = await matchService.revealCurrentAnswer(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Answer revealed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function revealFinalQuestion(req, res, next) {
  try {
    const match = await matchService.revealFinalQuestion(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Wager question revealed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function advanceToNextQuestion(req, res, next) {
  try {
    const match = await matchService.advanceToNextQuestion(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Question changed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function jumpToQuestion(req, res, next) {
  try {
    const payload = validate(jumpQuestionValidation, req.body);
    const match = await matchService.jumpToQuestion(req.params.id, req.user.id, payload);

    return res.status(200).json({
      success: true,
      message: "Question changed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function skipQuestion(req, res, next) {
  try {
    const match = await matchService.skipQuestion(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Question skipped successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function startIntermission(req, res, next) {
  try {
    const payload = validate(startIntermissionValidation, req.body);
    const match = await matchService.startIntermission(req.params.id, req.user.id, payload);

    return res.status(200).json({
      success: true,
      message: "Intermission started successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function endIntermission(req, res, next) {
  try {
    const match = await matchService.endIntermission(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Intermission ended successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function pauseMatch(req, res, next) {
  try {
    const match = await matchService.pauseMatch(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Match paused successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function resumeMatch(req, res, next) {
  try {
    const match = await matchService.resumeMatch(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Match resumed successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function closeMatch(req, res, next) {
  try {
    const data = await matchService.closeMatch(req.params.id, req.user.id);
    const billingFailed = data.billing && data.billing.billingStatus === "failed";

    return res.status(200).json({
      success: true,
      message: billingFailed ? "Match closed, but billing failed." : "Match closed successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function endMatch(req, res, next) {
  try {
    const match = await matchService.endMatch(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Match ended successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function cancelMatch(req, res, next) {
  try {
    const payload = validate(cancelMatchValidation, req.body);
    const match = await matchService.cancelMatch(req.params.id, req.user, payload.reason);

    return res.status(200).json({
      success: true,
      message: "Match cancelled successfully",
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMatches(req, res, next) {
  try {
    const query = validate(getMatchesQueryValidation, req.query);
    const data = await matchService.getMatches(query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyMatches(req, res, next) {
  try {
    const query = validate(getMatchesQueryValidation, req.query);
    const data = await matchService.getMyMatches(req.user.id, query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getOwnedMatchQuestions(req, res, next) {
  try {
    const data = await matchService.getOwnedMatchQuestions(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getTieBreakerQuestions(req, res, next) {
  try {
    const data = await matchService.getTieBreakerQuestions(req.params.id, req.user.id, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getTieBreakerSession(req, res, next) {
  try {
    const session = await tieBreakerService.getHostSession(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: { session } });
  } catch (error) { return next(error); }
}

async function startTieBreaker(req, res, next) {
  try {
    const session = await tieBreakerService.startSession(req.params.id, req.user.id, req.body || {});
    return res.status(201).json({ success: true, data: { session } });
  } catch (error) { return next(error); }
}

async function judgeTieBreaker(req, res, next) {
  try {
    const session = await tieBreakerService.judgeSession(req.params.id, req.user.id, req.body || {});
    return res.status(200).json({ success: true, data: { session } });
  } catch (error) { return next(error); }
}

async function reviewTieBreakerResponse(req, res, next) {
  try {
    const session = await tieBreakerService.reviewResponse(req.params.id, req.user.id, req.body || {});
    return res.status(200).json({ success: true, data: { session } });
  } catch (error) { return next(error); }
}

async function revealTieBreaker(req, res, next) {
  try {
    const session = await tieBreakerService.revealSession(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: { session } });
  } catch (error) { return next(error); }
}

async function getPublicMatchInfo(req, res, next) {
  try {
    const match = await matchService.getPublicMatchInfo(req.params.matchId);

    return res.status(200).json({
      success: true,
      data: { match },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMatchTeams(req, res, next) {
  try {
    const data = await playerService.getMatchTeams(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function removeTeam(req, res, next) {
  try {
    const payload = validate(removeTeamValidation, req.body || {});
    const team = await playerService.removeTeam(
      req.params.id,
      req.params.teamId,
      req.user.id,
      payload.reason
    );

    return res.status(200).json({
      success: true,
      message: "Team removed successfully",
      data: {
        team,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function restoreTeam(req, res, next) {
  try {
    const team = await playerService.restoreTeam(req.params.id, req.params.teamId, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Team restored successfully",
      data: {
        team,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function reopenAnswer(req, res, next) {
  try {
    validate(reopenAnswerValidation, req.body || {});
    const answer = await answerService.reopenAnswer(req.params.id, req.params.answerId, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Answer reopened successfully",
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentQuestionSubmissions(req, res, next) {
  try {
    const data = await answerService.getCurrentQuestionSubmissions(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getAnswersByQuestion(req, res, next) {
  try {
    const query = validate(getAnswerQueryValidation, req.query);
    const data = await answerService.getAnswersByQuestion(
      req.params.id,
      req.params.questionId,
      req.user.id,
      query
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  advanceToNextQuestion,
  cancelMatch,
  closeCurrentQuestion,
  closeMatch,
  confirmMatch,
  createMatch,
  endIntermission,
  endMatch,
  getMatchById,
  getMatches,
  getMatchTeams,
  getCurrentQuestionSubmissions,
  getAnswersByQuestion,
  getMyActiveMatch,
  getMyMatches,
  getOwnedMatchQuestions,
  getTieBreakerQuestions,
  getTieBreakerSession,
  getPublicMatchInfo,
  jumpToQuestion,
  judgeTieBreaker,
  openCurrentQuestion,
  pauseMatch,
  revealCurrentAnswer,
  revealFinalQuestion,
  revealTieBreaker,
  resumeMatch,
  skipQuestion,
  startIntermission,
  startTieBreaker,
  startMatch,
  removeTeam,
  reopenAnswer,
  restoreTeam,
  reviewTieBreakerResponse,
};
