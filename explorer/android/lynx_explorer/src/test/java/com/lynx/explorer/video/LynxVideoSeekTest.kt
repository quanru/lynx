// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.lynx.explorer.video

import android.os.Looper
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxUIMethodConstants
import com.lynx.xelement.video.LynxUIVideo
import com.lynx.xelement.video.LynxVideoPlayable
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
@LooperMode(LooperMode.Mode.PAUSED)
class LynxVideoSeekTest {
  private class Player : LynxVideoPlayable {
    val seeks = mutableListOf<Pair<Long, () -> Unit>>()
    override fun seek(positionMs: Long, onComplete: () -> Unit) { seeks.add(positionMs to onComplete) }
    override fun getDuration() = 10000L
    override fun getCurrentPosition() = 0L
    override fun isPlaying() = false
    override fun setSrc(src: String?) {}
    override fun setLoop(loop: Boolean) {}
    override fun setVolume(volume: Float) {}
    override fun setMuted(muted: Boolean) {}
    override fun setSpeed(speed: Float) {}
    override fun setObjectFit(objectFit: String?) {}
    override fun play() {}
    override fun pause() {}
    override fun stop() {}
    override fun setCallback(callback: LynxVideoPlayable.Callback?) {}
    override fun release() {}
  }

  private fun fixture(mode: String = "queue"): Pair<LynxUIVideo, Player> {
    val app = RuntimeEnvironment.getApplication()
    val context = LynxContext(app, app.resources.displayMetrics)
    // Test the production request scheduler without constructing a decoder.
    val ui = object : LynxUIVideo(context) { override fun initialize() {} }
    val player = Player()
    LynxUIVideo::class.java.getDeclaredField("mPlayable").apply {
      isAccessible = true
      set(ui, player)
    }
    ui.setMode(mode)
    ui.setSrc("test-source")
    return ui to player
  }

  private fun params(position: Double = 2.0) = JavaOnlyMap().apply { putDouble("position", position) }
  private fun callback(results: MutableList<JavaOnlyMap>) = Callback { args -> results.add(args[1] as JavaOnlyMap) }
  private fun drain() { shadowOf(Looper.getMainLooper()).idle() }

  @Test fun serialSeekWaitsForPlayerAcknowledgement() {
    for (mode in listOf("queue", "latest")) {
      val (ui, player) = fixture(mode)
      val results = mutableListOf<JavaOnlyMap>()
      ui.seek(params(), callback(results))
      drain()
      assertTrue(results.isEmpty())
      assertEquals(2000L, player.seeks.single().first)
      player.seeks.single().second()
      drain()
      assertTrue(results.single().getBoolean("success"))
      player.seeks.single().second()
      drain()
      assertEquals(1, results.size)
    }
  }

  @Test fun sourceChangeCancelsCurrentAndQueuedSeeksAndIgnoresLateAcknowledgement() {
    val (ui, player) = fixture()
    val results = mutableListOf<JavaOnlyMap>()
    ui.seek(params(), callback(results))
    ui.seek(params(3.0), callback(results))
    val oldCompletion = player.seeks.single().second
    ui.setSrc("")
    assertEquals(2, results.size)
    results.forEach {
      assertFalse(it.getBoolean("success"))
      assertEquals(LynxUIMethodConstants.OPERATION_ERROR, it.getInt("errorCode"))
      assertEquals("request canceled by src change", it.getString("msg"))
    }
    ui.setSrc("replacement-source")
    ui.seek(params(4.0), callback(results))
    oldCompletion()
    drain()
    assertEquals(2, results.size)
    player.seeks.last().second()
    drain()
    assertEquals(3, results.size)
    assertTrue(results.last().getBoolean("success"))
  }

  @Test fun cancellationWinsOverPostedCompletionAndDestroyDoesNotReportTwice() {
    for (destroy in listOf(false, true)) {
      val (ui, player) = fixture()
      val results = mutableListOf<JavaOnlyMap>()
      ui.seek(params(), callback(results))
      player.seeks.single().second()
      if (destroy) ui.destroy() else ui.setSrc("")
      drain()
      assertEquals(1, results.size)
      assertFalse(results.single().getBoolean("success"))
      player.seeks.single().second()
      drain()
      assertEquals(1, results.size)
    }
  }

  @Test fun completionAdvancesQueueAndLatestOnlyAfterAcknowledgement() {
    for (mode in listOf("queue", "latest")) {
      val (ui, player) = fixture(mode)
      ui.seek(params(1.0), null)
      ui.seek(params(2.0), null)
      ui.seek(params(3.0), null)
      assertEquals(listOf(1000L), player.seeks.map { it.first })
      player.seeks[0].second()
      drain()
      assertEquals(listOf(1000L, if (mode == "queue") 2000L else 3000L), player.seeks.map { it.first })
    }
  }

  @Test fun directAndInvalidParameterSemanticsAreUnchanged() {
    val (ui, player) = fixture("direct")
    val results = mutableListOf<JavaOnlyMap>()
    ui.seek(params(), callback(results))
    assertTrue(results.single().getBoolean("success"))
    player.seeks.single().second()
    drain()
    assertEquals(1, results.size)
    ui.seek(params(-1.0), callback(results))
    assertEquals(LynxUIMethodConstants.PARAM_INVALID, results.last().getInt("errorCode"))
    assertEquals(1, player.seeks.size)
  }
}
