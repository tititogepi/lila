package controllers

import strategygames.chess.format.{ FEN, Forsyth }
import strategygames.chess.Situation
import play.api.libs.json._
import views._

import lila.app._
import lila.common.Json._

final class Editor(env: Env) extends LilaController(env) {

  private lazy val positionsJson = lila.common.String.html.safeJsonValue {
    JsArray(strategygames.chess.StartingPosition.all map { p =>
      Json.obj(
        "eco"  -> p.eco,
        "name" -> p.name,
        "fen"  -> p.fen
      )
    })
  }

  def index = load("")

  def load(urlFen: String) =
    Open { implicit ctx =>
      val fenStr = lila.common.String
        .decodeUriPath(urlFen)
        .map(_.replace('_', ' ').trim)
        .filter(_.nonEmpty)
        .orElse(get("fen"))
      fuccess {
        val situation = readFen(fenStr)
        Ok(
          html.board.editor(
            sit = situation,
            fen = Forsyth >> situation,
            positionsJson
          )
        )
      }
    }

  def data =
    Open { implicit ctx =>
      fuccess {
        val situation = readFen(get("fen"))
        JsonOk(
          html.board.bits.jsData(
            sit = situation,
            fen = Forsyth >> situation
          )
        )
      }
    }

  private def readFen(fen: Option[String]): Situation =
    fen.map(_.trim).filter(_.nonEmpty).map(FEN.clean).flatMap(Forsyth.<<<).map(_.situation) |
      Situation(strategygames.chess.variant.Standard)

  def game(id: String) =
    Open { implicit ctx =>
      OptionResult(env.game.gameRepo game id) { game =>
        Redirect {
          if (game.playable) routes.Round.watcher(game.id, game.variant.startColor.name)
          else routes.Editor.load(get("fen") | (strategygames.chess.format.Forsyth >> game.chess).value)
        }
      }
    }
}
