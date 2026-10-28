// Security robots (patrol robots, their cameras): what they raise is alarms — a person, a vehicle, a forced door — and
// what operators need is the live video. Their makers' security software posts alarms to POST /api/fm/robots in its own
// shape; this reads the common fields into the report: the alarm becomes a security alert (answered by the
// orchestrator: the robot looks first, security responds), a snapshot is read by the AI vision model when sent, and the
// robot's live video address is kept so the cockpit can open it. The video itself stays on the maker's video system
// (RTSP/HLS/WebRTC): the core never carries the stream.
import type { RobotReport, SecurityAlert } from "../../fm/types";

const KIND: [RegExp, SecurityAlert["kind"]][] = [[/person|human|intrud|loiter/i, "person"], [/vehicle|car|truck/i, "vehicle"], [/drone|uav|uas/i, "drone"], [/fence|perimeter|tamper|cut/i, "fence"], [/animal|bird|wildlife|camel|dog/i, "wildlife"], [/debris|fod|object on/i, "fod"]];

/** A security robot's alarm, read leniently: robot, what (type/message), where, the video address. */
export function securityAlarmToReport(body: Record<string, unknown>): RobotReport | null {
  const b = body as { robot?: string; robotId?: string; device?: string; type?: string; event?: string; message?: string; description?: string; zone?: string; area?: string; videoUrl?: string; streamUrl?: string; video?: string; battery?: number };
  const robot = b.robot ?? b.robotId ?? b.device;
  if (!robot) return null;
  const what = [b.type, b.event, b.message, b.description].filter(Boolean).join(" — ");
  const kind = KIND.find(([re]) => re.test(what))?.[1] ?? "camera";
  const video = b.videoUrl ?? b.streamUrl ?? b.video;
  return { robot, source: "Security robot", ...(typeof b.battery === "number" ? { battery: b.battery } : {}), ...(b.zone || b.area ? { zone: String(b.zone ?? b.area) } : {}),
    ...(what ? { alerts: [{ kind, text: what.slice(0, 200), ...(b.zone || b.area ? { zone: String(b.zone ?? b.area) } : {}) }] } : {}),
    ...(video && /^(https?|rtsp|rtsps|wss?):\/\//i.test(video) ? { video: String(video).slice(0, 400) } : {}) };
}
