package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"github.com/yashwanta/AMRDashboard/internal/api/handlers"
	"github.com/yashwanta/AMRDashboard/internal/config"
)

func NewRouter(db *pgxpool.Pool, cfg *config.Config) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	authH := handlers.NewAuthHandler(db, cfg.AdminUsername, cfg.AdminPassword, cfg.SessionSecret)
	serverH := handlers.NewServerHandler(db, cfg.EncryptionKey)
	logH := handlers.NewLogHandler(db)
	syncH := handlers.NewSyncHandler(db, cfg.EncryptionKey)
	actionH := handlers.NewActionHandler(db, cfg.EncryptionKey, cfg.AllowCustomCommands)
	ragH := handlers.NewRAGHandler(db)
	userH := handlers.NewUserHandler(db)

	r.Route("/api", func(r chi.Router) {
		r.Post("/auth/login", authH.Login)

		// Public read-only pages: Dashboard, Logs, Ask SiteOps.
		r.Get("/servers", serverH.List)
		r.Get("/logs", logH.List)
		r.Get("/stats", logH.Stats)
		r.Get("/timeline", logH.Timeline)
		r.Get("/server-stats", logH.ServerStats)
		r.Post("/sync/all", syncH.SyncAll)
		r.Post("/rag/query", ragH.Query)
		r.Get("/rag/history", ragH.History)

		r.Group(func(r chi.Router) {
			r.Use(authH.Middleware)
			r.Get("/auth/me", authH.Me)

			r.Get("/incidents/summary", logH.IncidentSummary)
			r.Get("/sync-history", logH.SyncHistory)

			r.Group(func(r chi.Router) {
				r.Use(authH.AdminOnly)

				// Admin server setup.
				r.Post("/servers", serverH.Create)
				r.Put("/servers/{id}", serverH.Update)
				r.Delete("/servers/{id}", serverH.Delete)

				// Sync
				r.Post("/servers/{id}/sync", syncH.SyncServer)
				r.Post("/servers/{id}/deep-sync", syncH.DeepSync)
				r.Post("/sync/test", syncH.TestConnection)

				// Remote actions
				r.Post("/actions/run", actionH.Run)
				r.Get("/actions/history", actionH.History)

				// Setup
				r.Get("/users", userH.List)
				r.Post("/users", userH.Create)
				r.Put("/users/{id}", userH.Update)
				r.Delete("/users/{id}", userH.Delete)
			})
		})
	})

	corsH := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: false,
	})

	return corsH.Handler(r)
}
