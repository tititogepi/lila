package lila.pref

import play.api.mvc.RequestHeader

object RequestPref {

  import Pref.default

  def queryParamOverride(req: RequestHeader)(pref: Pref): Pref =
    queryParam(req, "bg").flatMap(Pref.Bg.fromString.get).fold(pref) { bg =>
      pref.copy(bg = bg)
    }

  def fromRequest(req: RequestHeader): Pref = {

    def paramOrSession(name: String): Option[String] =
      queryParam(req, name) orElse req.session.get(name)
    
    def updateSessionWithParam(name: String): Option[List[PieceSet]] = {
      //I dont think these prefs are stored in the session data, so its always using default?
      req.session.get(name) match {
        case Some(_) =>
            queryParam(req, name) match {
                case Some(_) => default.pieceSet.some
                //case Some(v) => PieceSet.updatePieceSet(ps, v.pp("update value")).some
                case _ => None
                }
         case _ => None
       }
    }

    default.copy(
      bg = paramOrSession("bg").flatMap(Pref.Bg.fromString.get) | default.bg,
      theme = paramOrSession("theme") | default.theme,
      theme3d = paramOrSession("theme3d") | default.theme3d,
      pieceSet = updateSessionWithParam("pieceSet") | default.pieceSet,
      pieceSet3d = paramOrSession("pieceSet3d") | default.pieceSet3d,
      soundSet = paramOrSession("soundSet") | default.soundSet,
      bgImg = paramOrSession("bgImg"),
      is3d = paramOrSession("is3d") has "true"
    )
  }

  private def queryParam(req: RequestHeader, name: String): Option[String] =
    req.queryString.get(name).flatMap(_.headOption).filter { v =>
      v.nonEmpty && v != "auto"
    }
}
