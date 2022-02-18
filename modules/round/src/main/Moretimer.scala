package lila.round

import strategygames.{ Player => PlayerIndex }

import lila.game.{ Event, Game, Pov, Progress }
import lila.pref.{ Pref, PrefApi }
import scala.concurrent.duration.FiniteDuration

final private class Moretimer(
    messenger: Messenger,
    prefApi: PrefApi
)(implicit ec: scala.concurrent.ExecutionContext) {

  // pov of the player giving more time
  def apply(pov: Pov, duration: FiniteDuration): Fu[Option[Progress]] =
    IfAllowed(pov.game) {
      (pov.game moretimeable !pov.playerIndex) ?? {
        if (pov.game.hasClock) give(pov.game, List(!pov.playerIndex), duration).some
        else
          pov.game.hasCorrespondenceClock option {
            messenger.volatile(pov.game, s"${!pov.playerIndex} gets more time")
            val p = pov.game.correspondenceGiveTime
            p.game.correspondenceClock.map(Event.CorrespondenceClock.apply).fold(p)(p + _)
          }
      }
    }

  def isAllowedIn(game: Game): Fu[Boolean] =
    if (game.isMandatory) fuFalse
    else isAllowedByPrefs(game)

  private[round] def give(game: Game, playerIndexs: List[PlayerIndex], duration: FiniteDuration): Progress =
    game.clock.fold(Progress(game)) { clock =>
      val centis = duration.toCentis
      val newClock = playerIndexs.foldLeft(clock) { case (c, playerIndex) =>
        c.giveTime(playerIndex, centis)
      }
      playerIndexs.foreach { c =>
        messenger.volatile(game, s"$c + ${duration.toSeconds} seconds")
      }
      (game withClock newClock) ++ playerIndexs.map { Event.ClockInc(_, centis) }
    }

  private def isAllowedByPrefs(game: Game): Fu[Boolean] =
    game.userIds.map {
      prefApi.getPref(_, (p: Pref) => p.moretime)
    }.sequenceFu dmap {
      _.forall { p =>
        p == Pref.Takeback.ALWAYS || (p == Pref.Takeback.CASUAL && game.casual)
      }
    }

  private def IfAllowed[A](game: Game)(f: => A): Fu[A] =
    if (!game.playable) fufail(ClientError("[moretimer] game is over " + game.id))
    else if (game.isMandatory) fufail(ClientError("[moretimer] game disallows it " + game.id))
    else
      isAllowedByPrefs(game) flatMap {
        case true => fuccess(f)
        case _    => fufail(ClientError("[moretimer] disallowed by preferences " + game.id))
      }
}
