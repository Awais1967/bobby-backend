const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";

function getEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isConfigured() {
  return Boolean(
    getEnv("GOOGLE_CLIENT_ID") &&
      getEnv("GOOGLE_CLIENT_SECRET") &&
      getEnv("GOOGLE_REFRESH_TOKEN") &&
      getEnv("GOOGLE_CALENDAR_ID")
  );
}

function formatGoogleDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function addOneDay(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function getAccessToken() {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: getEnv("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to get Google access token.");
  }

  return data.access_token;
}

function buildEventPayload(game) {
  const date = formatGoogleDate(game.scheduledDate);
  if (!date) return null;

  return {
    summary: game.title,
    description: [game.description, `Trivia Goat game status: ${game.status}`].filter(Boolean).join("\n\n"),
    start: { date },
    end: { date: addOneDay(date) },
    extendedProperties: {
      private: {
        triviaGoatGameId: String(game._id || game.id),
      },
    },
  };
}

async function requestCalendar(method, path, body) {
  const calendarId = encodeURIComponent(getEnv("GOOGLE_CALENDAR_ID"));
  const accessToken = await getAccessToken();
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${calendarId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || "Google Calendar request failed.");
  }

  return data;
}

async function syncGameToGoogleCalendar(game) {
  if (!isConfigured()) return null;

  const payload = buildEventPayload(game);
  if (!payload || game.status === "archived") {
    await deleteGameFromGoogleCalendar(game);
    return null;
  }

  if (game.googleCalendarEventId) {
    return requestCalendar(
      "PATCH",
      `/events/${encodeURIComponent(game.googleCalendarEventId)}`,
      payload
    );
  }

  return requestCalendar("POST", "/events", payload);
}

async function deleteGameFromGoogleCalendar(game) {
  if (!isConfigured() || !game?.googleCalendarEventId) return;

  try {
    await requestCalendar("DELETE", `/events/${encodeURIComponent(game.googleCalendarEventId)}`);
  } catch (error) {
    if (!String(error.message || "").includes("Not Found")) {
      throw error;
    }
  }
}

module.exports = {
  deleteGameFromGoogleCalendar,
  isConfigured,
  syncGameToGoogleCalendar,
};
