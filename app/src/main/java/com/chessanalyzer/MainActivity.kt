package com.chessanalyzer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.chessanalyzer.ui.screens.DashboardScreen
import com.chessanalyzer.ui.screens.GameReviewScreen
import com.chessanalyzer.ui.theme.ChessAnalyzerTheme
import com.chessanalyzer.ui.theme.DarkBackground
import com.chessanalyzer.viewmodel.GameReviewViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ChessAnalyzerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = DarkBackground
                ) {
                    ChessAnalyzerApp()
                }
            }
        }
    }
}

@Composable
fun ChessAnalyzerApp() {
    val navController = rememberNavController()
    val viewModel: GameReviewViewModel = viewModel()

    NavHost(navController = navController, startDestination = "dashboard") {
        composable("dashboard") {
            DashboardScreen(
                navController = navController,
                viewModel = viewModel
            )
        }
        composable("review") {
            GameReviewScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
